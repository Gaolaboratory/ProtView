/* worker_mzml.js */
import init, { parse_spectrum } from './pkg/mass_spec_wasm.js';

// State
let fileHandle = null;
let scanIndex = new Map(); // scan_nr -> { offset, length }
let isIndexing = false;
let wasmInitialized = false;

// Message Handler
self.onmessage = async function (e) {
    const { type, payload } = e.data;

    try {
        if (!wasmInitialized) {
            await init();
            wasmInitialized = true;
        }

        if (type === 'INIT_FILE') {
            fileHandle = payload.file;
            await buildIndex(fileHandle);
            self.postMessage({ type: 'INDEX_COMPLETE', payload: { count: scanIndex.size, firstScanNr: scanIndex.keys().next().value } });
        }
        else if (type === 'GET_SPECTRUM') {
            const { scanNr } = payload;
            if (!fileHandle) throw new Error("File not loaded");

            const spectrum = await getSpectrum(scanNr);
            console.log(`[Worker] Spectrum ${scanNr} parsed. Peaks: ${spectrum ? spectrum.length : 0}`);

            self.postMessage({
                type: 'SPECTRUM_DATA',
                payload: { scanNr, spectrum }
            });
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', payload: error.message });
    }
};

async function buildIndex(file) {
    isIndexing = true;
    scanIndex.clear();
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    const OVERLAP = 1024;
    let offset = 0;

    // Naive regex stream for indexing
    const regex = /<spectrum\s+[^>]*id="[^"]*scan=(\d+)"/g;

    // Check if we can use stream?
    // FileReader is standard.
    // For indexing we stick to JS because it's IO bound and Regex in V8 is fast enough.
    // Wasm overhead for simple regex scanning might be high if we cross boundary often.

    const decoder = new TextDecoder();

    while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        const text = decoder.decode(buffer, { stream: true });

        let match;
        while ((match = regex.exec(text)) !== null) {
            const scanNr = parseInt(match[1]);
            const absStart = offset + match.index;
            scanIndex.set(scanNr, absStart);
        }

        offset += CHUNK_SIZE - OVERLAP;
        if (offset % (CHUNK_SIZE * 5) === 0) {
            self.postMessage({ type: 'PROGRESS', payload: { percent: (offset / file.size) * 100 } });
        }
    }
    isIndexing = false;
}

async function getSpectrum(scanNr) {
    if (!scanIndex.has(scanNr)) return null;
    const startOffset = scanIndex.get(scanNr);

    // Read chunk
    let currentOffset = startOffset;
    const READ_SIZE = 50 * 1024;
    let spectrumXml = "";

    while (true) {
        const slice = fileHandle.slice(currentOffset, currentOffset + READ_SIZE);
        const text = await slice.text();
        spectrumXml += text;

        const endTag = "</spectrum>";
        const idx = spectrumXml.indexOf(endTag);

        if (idx !== -1) {
            spectrumXml = spectrumXml.substring(0, idx + endTag.length);
            break;
        }
        if (text.length < READ_SIZE && (currentOffset + READ_SIZE) >= fileHandle.size) break;
        currentOffset += READ_SIZE;
    }

    console.log(`[Worker] XML for Scan ${scanNr} (first 200 chars):`, spectrumXml.substring(0, 200));

    // Call Wasm Parser
    // Wasm expects string
    const result = parse_spectrum(spectrumXml);
    console.log(`[Worker] Wasm returned ${result.length} peaks.`);
    return result;
}
