# ProtView - Mass Spectrum Annotator
# Mass Spec Vue (Frontend Only)

A high-performance, client-side mass spectrometry viewer powered by **Rust** and **WebAssembly**.

## Features
- **Zero Server Backend**: All processing happens locally in your browser using Wasm.
- **Visualizations**: 
    - Interactive Spectrum Plot (Plotly.js)
    - **Peptide Ladder**: Visual indicator of b/y ion breakage points.
- **Controls**:
    - Variable Tolerance (Da/ppm)
    - Dynamic re-calculation
- **Formats**: Supports `.mzML` (indexed) and `.pin` (Percolator) files.

## Getting Started (Local Development)

### 1. Simple HTTP Server
Since the app is purely static files, you can run it with any static file server.

**Using Python:**
```bash
cd frontend
python -m http.server 8000
```
Then open `http://localhost:8000`.

### 2. Docker
To run the pre-built Nginx container:

```bash
docker build -t protview .
docker run -p 8080:80 protview
```
Open `http://localhost:8080`.

### 3. Building from Source (Wasm)
If you want to modify the Rust code:

1.  **Install Rust**: `rustup`
2.  **Install wasm-pack**: `cargo install wasm-pack`
3.  **Build**:
    ```bash
    cd frontend/wasm
    wasm-pack build --target web --out-dir ../pkg
    ```

## Usage Guide
1.  **Launch**: Open the app in your browser.
2.  **Load Files**:
    -   Click **Choose File** for `.mzML` (Spectra).
    -   Click **Choose File** for `.pin` (Identifications).
    -   Click **Load Files** to index the data.
3.  **Settings**:
    -   Adjust **Tolerance** (e.g., 0.1 Da or 20 ppm) to refine matching.
4.  **Visualize**: 
    -   Click a peptide in the list.
    -   The **Peptide Ladder** (top) shows the sequence and matched ions (Blue=b, Red=y).
    -   The **Spectrum Plot** (bottom) shows the peaks.

