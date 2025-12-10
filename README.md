# ProtView - Mass Spectrum Annotator

ProtView is an interactive web-based application for visualizing and annotating peptide mass spectra. It calculates theoretical b- and y-ions for a given peptide sequence and highlights matching peaks in the observed spectrum.

## Features
- **Interactive Visualization**: Zoom, pan, and inspect peaks using a dynamic Plotly interface.
- **Automatic Annotation**: Instantly identifies and labels b (blue) and y (red) ions.
- **Customizable**: Adjust charge states and mass tolerance.
- **Example Data**: Built-in demonstration dataset for quick testing.
- **Dockerized**: Easy deployment with Docker.

## Technology Stack
- **Backend**: Python 3.9+, FastAPI
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Plotly.js

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
    The app will be available at `http://localhost:8000`.

## Docker Usage

1.  **Build the container**:
    ```bash
    docker build -t protview .
    ```

2.  **Run the container**:
    ```bash
    docker run -p 8000:8000 protview
    ```

3.  Access the application at `http://localhost:8000`.

## Usage Guide
1.  **Sequence**: Enter the amino acid sequence (e.g., `VLHPLEGAVVIIFK`).
2.  **Charge**: Set the precursor charge state.
3.  **Tolerance**: Define the matching tolerance in Daltons (e.g., `0.5`).
4.  **Spectrum**: Paste your mass list (m/z intensity) into the text area.
5.  Click **Visualize & Annotate**.
6.  **Zoom Reset**: Double-click anywhere on the plot to reset the zoom (1-second delay).

