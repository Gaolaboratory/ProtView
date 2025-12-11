/* app.js */
import { parsePin } from './pin_parser.js';

// DOM Elements
const mzmlInput = document.getElementById('mzml-file');
const pinInput = document.getElementById('pin-file');
const loadBtn = document.getElementById('load-btn');
const peptideGridEl = document.getElementById('peptide-grid');
const plotContainer = document.getElementById('plot-container');
const statusMsg = document.getElementById('status-msg');

let gridApi = null;
let currentPeptides = []; // List of peptides
let currentMzmlFile = null;

// Workers
const mzmlWorker = new Worker('./worker_mzml.js', { type: 'module' });
const calcWorker = new Worker('./worker_calculations.js', { type: 'module' });

// Message Handlers
mzmlWorker.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INDEX_COMPLETE') {
        showStatus(`Indexed ${payload.count} scans. Ready to visualize.`, 'success');
        loadBtn.disabled = false;
        loadBtn.textContent = "Load Files";

        // Auto-verify: Load first spectrum
        if (payload.firstScanNr) {
            showStatus(`Indexed ${payload.count} scans. Verifying Scan ${payload.firstScanNr}...`, 'normal');
            mzmlWorker.postMessage({ type: 'GET_SPECTRUM', payload: { scanNr: payload.firstScanNr } });
        }

    } else if (type === 'SPECTRUM_DATA') {
        const { scanNr, spectrum } = payload;
        // Update global state
        currentSpectrumData = spectrum;

        console.log("Spectrum received:", spectrum);

        // Spectrum loaded, now calculate matches
        // We need the current peptide info
        const peptide = currentPeptides.find(p => p.scan_nr === scanNr);
        if (peptide && spectrum) {
            calcWorker.postMessage({
                type: 'CALC_AND_MATCH',
                payload: {
                    sequence: peptide.sequence,
                    charge: peptide.charge,
                    peaks: spectrum,
                    tolerance: 0.5
                }
            });
            // Temporary render of just peaks while we wait?
            // renderPlot({ peaks: spectrum, matches: [] }, peptide.sequence, peptide.charge);
        } else if (spectrum) {
            // No matching peptide found (auto-load verification case)
            renderPlot({ peaks: spectrum, matches: [] }, `Scan ${scanNr} (Raw)`, "?");
            showStatus(`Verification: Scan ${scanNr} loaded with ${spectrum.length} peaks.`, 'success');
        } else {
            showStatus("Error: Spectrum data is empty or invalid.", 'error');
        }
    } else if (type === 'PROGRESS') {
        showStatus(`Indexing mzML... ${payload.percent.toFixed(0)}%`, 'normal');
    } else if (type === 'ERROR') {
        console.error("Worker Error:", payload);
        showStatus("Error: " + payload, 'error');
        loadBtn.disabled = false;
    }
};

calcWorker.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'MATCH_RESULT') {
        const { matches } = payload;
        // Logic to get peaks again? 
        // We need the peaks to render the background bars.
        // Option A: Store current spectrum globally.
        // Option B: Pass peaks back from worker (heavy).
        // Let's store current spectrum in a variable when we request calc.
        if (currentSpectrumData) {
            renderPlot({ peaks: currentSpectrumData, matches }, currentPeptideData.sequence, currentPeptideData.charge);
        }
    } else if (type === 'ERROR') {
        console.error("Calc Error:", payload);
        showStatus("Calculation Error: " + payload, 'error');
    }
};

// State for synchronization
let currentSpectrumData = null;
let currentPeptideData = null;

// Event Listeners
if (loadBtn) {
    loadBtn.addEventListener('click', handleLoadFiles);
}

async function handleLoadFiles() {
    const mzmlFile = mzmlInput.files[0];
    const pinFile = pinInput.files[0];

    if (!mzmlFile) {
        showStatus("Please select an mzML file.", "error");
        return;
    }

    // Disable UI
    loadBtn.disabled = true;
    loadBtn.textContent = "Processing...";

    // 1. Parse PIN if provided
    if (pinFile) {
        showStatus("Parsing peptide list...", "normal");
        try {
            const peptides = await parsePin(pinFile);
            currentPeptides = peptides;
            renderAgGrid(peptides);
            showStatus(`Loaded ${peptides.length} peptides.`, "success");
        } catch (err) {
            console.error(err);
            showStatus("Error parsing PIN: " + err.message, "error");
            loadBtn.disabled = false;
            return;
        }
    } else {
        // If no PIN, maybe we just explore spectra? (Not implemented in UI yet)
        showStatus("No PIN file selected. Please select one.", "warning");
        loadBtn.disabled = false;
        return;
    }

    // 2. Index mzML
    showStatus("Indexing mzML file...", "normal");
    currentMzmlFile = mzmlFile;
    mzmlWorker.postMessage({ type: 'INIT_FILE', payload: { file: mzmlFile } });
}

function renderAgGrid(peptides) {
    if (gridApi) {
        gridApi.destroy(); // or setRowData
    }
    peptideGridEl.innerHTML = '';

    if (peptides.length === 0) {
        peptideGridEl.innerHTML = '<div class="placeholder-text">No peptides found.</div>';
        return;
    }

    const gridOptions = {
        rowData: peptides,
        columnDefs: [
            { field: 'sequence', headerName: 'Peptide', flex: 2, sortable: true, filter: true },
            { field: 'charge', headerName: 'Chg', width: 70, sortable: true },
            { field: 'scan_nr', headerName: 'Scan', width: 80, sortable: true, filter: 'agNumberColumnFilter' },
            { field: 'spec_id', headerName: 'Spec ID', flex: 1, hide: true }
        ],
        defaultColDef: {
            resizable: true,
            sortable: true
        },
        rowSelection: 'single',
        onRowClicked: (event) => {
            loadSpectrum(event.data);
        },
        headerHeight: 30,
        rowHeight: 30
    };

    gridApi = agGrid.createGrid(peptideGridEl, gridOptions);
}

function loadSpectrum(peptide) {
    currentPeptideData = peptide;
    currentSpectrumData = null; // Clear old
    showStatus(`Loading Scan ${peptide.scan_nr}...`, "normal");

    // Request spectrum from worker
    // Worker will reply with SPECTRUM_DATA
    // Then we trigger calcWorker
    // Note: We need to intercept the response to store currentSpectrumData

    // To cleanly handle the async flow:
    // We attach a one-time listener or just rely on global state.
    // Relying on global `currentPeptideData` is fine for single-user client.

    // Helper interception:
    const tempListener = (e) => {
        if (e.data.type === 'SPECTRUM_DATA' && e.data.payload.scanNr === peptide.scan_nr) {
            currentSpectrumData = e.data.payload.spectrum;
            mzmlWorker.removeEventListener('message', tempListener);
        }
    };
    // Actually, the main listener handles dispatch. We just need to make sure `currentSpectrumData` is set there.
    // See `mzmlWorker.onmessage` above.

    mzmlWorker.postMessage({ type: 'GET_SPECTRUM', payload: { scanNr: peptide.scan_nr } });
}

function showStatus(msg, type) {
    if (statusMsg) {
        statusMsg.textContent = msg;
        if (type === "error") statusMsg.style.color = "var(--error-color)";
        else if (type === "success") statusMsg.style.color = "var(--success-color)";
        else statusMsg.style.color = "var(--text-secondary)";
    }
}

function renderPlot(data, sequence, charge) {
    if (!plotContainer) return;
    plotContainer.innerHTML = '';

    const peaks = data.peaks;
    const matches = data.matches;

    // Helper for min/max
    const getMin = (arr) => { let m = Infinity; for (let v of arr) if (v < m) m = v; return m; };
    const getMax = (arr) => { let m = -Infinity; for (let v of arr) if (v > m) m = v; return m; };

    const xPeaks = peaks.map(p => p.mz);
    const yPeaks = peaks.map(p => p.intensity);
    const hoverTexts = peaks.map(p => `m/z: ${p.mz.toFixed(4)}<br>Int: ${p.intensity.toFixed(1)}`);

    const minMz = xPeaks.length ? getMin(xPeaks) : 0;
    const maxMz = xPeaks.length ? getMax(xPeaks) : 1000;
    const maxY = yPeaks.length ? getMax(yPeaks) : 100;

    const barWidth = 0.05;

    // Unmatched Trace
    const tracePeaks = {
        x: xPeaks,
        y: yPeaks,
        type: 'bar',
        name: 'Peaks',
        marker: {
            color: '#606060', // Gray
            line: { width: 0 }
        },
        width: barWidth,
        hoverinfo: 'text',
        text: hoverTexts,
        textposition: 'none'
    };

    const traces = [tracePeaks];

    // Matches as annotations
    const bMatches = matches.filter(m => m.ion_type.startsWith('b'));
    const yMatches = matches.filter(m => m.ion_type.startsWith('y'));

    if (bMatches.length > 0) {
        traces.push({
            x: bMatches.map(m => m.peak_mz),
            y: bMatches.map(m => m.peak_intensity),
            type: 'bar',
            name: 'b-ions',
            marker: { color: '#3b82f6', line: { width: 0 } },
            width: barWidth,
            hoverinfo: 'x+y+name'
        });
    }

    if (yMatches.length > 0) {
        traces.push({
            x: yMatches.map(m => m.peak_mz),
            y: yMatches.map(m => m.peak_intensity),
            type: 'bar',
            name: 'y-ions',
            marker: { color: '#ef4444', line: { width: 0 } },
            width: barWidth,
            hoverinfo: 'x+y+name'
        });
    }

    // Create annotations
    const annotations = [];
    matches.forEach(m => {
        const color = m.ion_type.startsWith('b') ? '#3b82f6' : '#ef4444';
        annotations.push({
            x: m.peak_mz,
            y: m.peak_intensity,
            text: m.ion_type,
            showarrow: false,
            yshift: 10,
            font: { color: color, size: 12 }
        });
    });

    const layout = {
        title: {
            text: `Spectrum for [${sequence}]${charge}+`,
            font: { size: 16 }
        },
        xaxis: {
            title: 'm/z',
            range: [minMz - 50, maxMz + 50],
            fixedrange: false
        },
        yaxis: {
            title: 'Intensity',
            range: [0, maxY * 1.2],
            fixedrange: true
        },
        annotations: annotations,
        showlegend: true,
        legend: {
            font: { color: '#1f2937' },
            orientation: 'h',
            y: 1.15
        },
        margin: { t: 60, r: 20, l: 60, b: 50 },
        autosize: true
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        doubleClickDelay: 1000
    };

    Plotly.newPlot('plot-container', traces, layout, config);

    // Update global currentSpectrumData helper for callback
    if (peaks !== currentSpectrumData) currentSpectrumData = peaks;
}

// Initial Status
showStatus("Select mzML and .pin files to start.", "normal");
