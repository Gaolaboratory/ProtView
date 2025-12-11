# ProtView - Mass Spectrum Annotator
# Mass Spec Vue (Frontend Only)

A high-performance, client-side mass spectrometry viewer powered by **Rust** and **WebAssembly**.

## Features
- **Backend**: Python 3.9+, FastAPI, Pandas, lxml
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Plotly.js, ag-Grid Community
## Getting Started (Local Development)
### Prerequisites
- Python 3.9 or higher
- pip
### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/Gaolaboratory/ProtView.git
    cd protview
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Run the application:
    ```bash
    uvicorn backend.main:app --reload
    ```
4.  Open `http://localhost:8000` in your browser.
## Docker Usage
To access your local `.mzML` and `.pin` files, you must **mount** the directory containing them to `/data` inside the container.
1.  **Build the container**:
    ```bash
    docker build -t protview .
    ```
2.  **Run with volume mount**:
   Replace `/path/to/your/data` with the actual folder path containing your MS files.
    ```bash
    docker run -p 8000:8000 -v /path/to/your/data:/data protview
    ```
3.  Access the UI at `http://localhost:8000`.
   *   When prompted for file paths in the UI, use the container path: `/data/yourfile.mzML` and `/data/yourfile.pin`.
## Usage Guide
1.  **Load Files**: Enter the absolute path to your `.mzML` and `.pin` files. 
    *   *Windows Example*: `C:\Data\experiment.mzML`
    *   *Docker Example*: `/data/experiment.mzML`
2.  **Browse Peptides**: Use the grid on the left to scroll through identified peptides.
3.  **Visualize**: Click any peptide row to load its spectrum and theoretical ion matches.
4.  **Interact**:
    *   **Zoom**: Click and drag to zoom in.
    *   **Double-click**: Reset zoom.
    *   **Hover**: View m/z and intensity details.
