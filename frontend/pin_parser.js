/* pin_parser.js */

export function parsePin(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split(/\r?\n/);
                if (lines.length < 2) {
                    resolve([]);
                    return;
                }

                // Header
                const header = lines[0].split('\t');
                const colMap = {};
                header.forEach((col, idx) => {
                    colMap[col.trim()] = idx;
                });

                // Identify key columns
                // Required: ScanNr, Peptide
                // Optional: SpecId, charge_X

                const scanNrIdx = findCol(colMap, ['ScanNr', 'scannr', 'ScanNum']);
                const peptideIdx = findCol(colMap, ['Peptide', 'peptide']);
                const specIdIdx = findCol(colMap, ['SpecId', 'specid', 'id']);

                // Identify charge columns
                const chargeCols = [];
                for (let col in colMap) {
                    if (col.toLowerCase().startsWith('charge')) {
                        // Extract number
                        const parts = col.split('_');
                        if (parts.length >= 2) {
                            const z = parseInt(parts[1]);
                            if (!isNaN(z)) {
                                chargeCols.push({ z: z, idx: colMap[col] });
                            }
                        }
                    }
                }

                const peptides = [];

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = line.split('\t');

                    // Safety check
                    if (cols.length < header.length) continue; // Skip malformed?

                    const scanNr = parseInt(cols[scanNrIdx]);
                    let peptideSeq = cols[peptideIdx] || "";
                    const specId = specIdIdx !== -1 ? cols[specIdIdx] : "";

                    // Determine charge
                    let charge = 2; // Default
                    for (let cCol of chargeCols) {
                        if (parseInt(cols[cCol.idx]) === 1) {
                            charge = cCol.z;
                            break;
                        }
                    }

                    // Clean peptide sequence
                    // R.ACDE.K -> ACDE
                    if (peptideSeq.includes('.')) {
                        const parts = peptideSeq.split('.');
                        if (parts.length >= 3) {
                            // "R.SEQ.K" -> parts[1] is SEQ
                            peptideSeq = parts[1];
                        } else if (parts.length === 2) {
                            // Unexpected format? Just take longest part?
                            // Standard Percolator output is fl.seq.fl
                            peptideSeq = parts.find(p => p.length > 2) || peptideSeq;
                        }
                    }

                    // Replace brackets with parentheses
                    peptideSeq = peptideSeq.replace(/\[/g, '(').replace(/\]/g, ')');

                    if (!isNaN(scanNr)) {
                        peptides.push({
                            scan_nr: scanNr,
                            spec_id: specId,
                            sequence: peptideSeq,
                            charge: charge
                        });
                    }
                }

                resolve(peptides);

            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function findCol(map, candidates) {
    for (let c of candidates) {
        // Case insensitive match
        for (let actualCol in map) {
            if (actualCol.toLowerCase() === c.toLowerCase()) {
                return map[actualCol];
            }
        }
    }
    return -1;
}
