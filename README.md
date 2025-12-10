# ProtView - Mass Spectrum Annotator
ProtView is an interactive web-based application for visualizing and annotating peptide mass spectra. It reads `.mzML` and `.pin` files to visualize identified peptides and their theoretical b- and y-ion matches.
## Features
- **MS File Support**: Reads `.mzML` (spectra) and `.pin` (Percolator/peptide) files directly.
- **Interactive Visualization**: Zoom, pan, and inspect peaks using a dynamic Plotly interface with annotation sticks.
- **Data Grid**: Efficiently browses large peptide lists (100k+ rows) using ag-Grid with filtering.
- **Lazy Loading**: Optimized for performance by reading spectra segments on-demand.
- **Dockerized**: specific support for mounting local data volumes.
## Technology Stack
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
