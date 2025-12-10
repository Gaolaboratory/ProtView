// DOM Elements
const readBtn = document.getElementById('read-btn');
const mzmlPathInput = document.getElementById('mzml-path');
const pinPathInput = document.getElementById('pin-path');
const peptideGrid = document.getElementById('peptide-grid');
const plotContainer = document.getElementById('plot-container');
const statusMsg = document.getElementById('status-msg');

let gridApi = null; // ag-Grid API

// Event Listeners
if (readBtn) {
    readBtn.addEventListener('click', handleReadLocal);
} else {
    console.error("Read button not found");
}

// State
let currentData = null;

async function handleReadLocal() {
    console.log("Read Local Clicked");
    const mzmlPath = mzmlPathInput.value.trim();
    const pinPath = pinPathInput.value.trim();

    if (!mzmlPath || !pinPath) {
        showStatus("Please enter both mzML and .pin file paths.", "error");
        return;
    }

    // Remove quotes if user copied path as string
    const cleanMzml = mzmlPath.replace(/^"|"$/g, '');
    const cleanPin = pinPath.replace(/^"|"$/g, '');

    showStatus("Reading local files...", "normal");
    readBtn.disabled = true;

    try {
        const response = await fetch('/api/load_local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mzml_path: cleanMzml, pin_path: cleanPin })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Load failed");
        }

        const data = await response.json();
        renderAgGrid(data.peptides);
        showStatus(data.message, "success");

    } catch (error) {
        console.error(error);
        showStatus("Error: " + error.message, "error");
    } finally {
        readBtn.disabled = false;
    }
}

function renderAgGrid(peptides) {
    // Clear previous grid
    peptideGrid.innerHTML = '';

    if (peptides.length === 0) {
        peptideGrid.innerHTML = '<div class="placeholder-text">No peptides found.</div>';
        return;
    }

    const gridOptions = {
        rowData: peptides,
        columnDefs: [
            { field: 'sequence', headerName: 'Peptide', flex: 2, sortable: true },
            { field: 'charge', headerName: 'Chg', width: 70, sortable: true },
            { field: 'scan_nr', headerName: 'Scan', width: 80, sortable: true },
            { field: 'spec_id', headerName: 'Spec ID', flex: 1, hide: true }
        ],
        defaultColDef: {
            resizable: true,
            sortable: true,
            filter: true
        },
        rowSelection: 'single',
        onRowClicked: (event) => {
            loadSpectrum(event.data);
        },
        animateRows: false,
        headerHeight: 30,
        rowHeight: 30
        // Removed 'theme: legacy' as it might be invalid
    };

    if (typeof agGrid !== 'undefined') {
        gridApi = agGrid.createGrid(peptideGrid, gridOptions);
    } else {
        showStatus("Error: ag-Grid library not loaded. Check internet connection.", "error");
    }
}

async function loadSpectrum(peptide) {
    showStatus(`Loading Scan ${peptide.scan_nr}...`, "normal");

    try {
        // Fix encoding for sequences with brackets
        const url = `/api/spectrum/${peptide.scan_nr}?sequence=${encodeURIComponent(peptide.sequence)}&charge=${peptide.charge}`;
        const response = await fetch(url);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to load spectrum");
        }

        const data = await response.json();
        renderPlot(data, peptide.sequence, peptide.charge);
        showStatus(`Loaded Scan ${peptide.scan_nr}`, "success");

    } catch (error) {
        console.error(error);
        showStatus("Error loading spectrum: " + error.message, "error");
    }
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

    const minMz = getMin(xPeaks);
    const maxMz = getMax(xPeaks);
    const maxY = getMax(yPeaks);

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

    // Create annotations for b and y ions
    const annotations = [];

    matches.forEach(m => {
        if (m.ion_type.startsWith('b')) {
            annotations.push({
                x: m.peak_mz,
                y: m.peak_intensity,
                text: m.ion_type,
                showarrow: false,
                yshift: 10,
                font: { color: '#3b82f6', size: 12 }
            });
        } else if (m.ion_type.startsWith('y')) {
            annotations.push({
                x: m.peak_mz,
                y: m.peak_intensity,
                text: m.ion_type,
                showarrow: false,
                yshift: 10,
                font: { color: '#ef4444', size: 12 }
            });
        }
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
}
