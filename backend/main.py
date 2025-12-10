from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
from pathlib import Path

from .calculations import calculate_ions, match_ions
from .mzml import LazyMzmlReader
from .pin_parser import parse_pin

app = FastAPI()

# Global state
ACTIVE_READER: Optional[LazyMzmlReader] = None

# Input model for local loading
class LocalLoadRequest(BaseModel):
    mzml_path: str
    pin_path: str

class IonMatch(BaseModel):
    peak_mz: float
    peak_intensity: float
    ion_type: str
    ion_charge: int
    theoretical_mz: float
    error: float

@app.post("/api/load_local")
async def load_local_files(request: LocalLoadRequest):
    global ACTIVE_READER
    
    try:
        # Validate paths
        if not os.path.exists(request.mzml_path):
            raise HTTPException(status_code=400, detail=f"mzML file not found: {request.mzml_path}")
        if not os.path.exists(request.pin_path):
            raise HTTPException(status_code=400, detail=f"PIN file not found: {request.pin_path}")
            
        # Parse PIN (from local path)
        peptides = parse_pin(request.pin_path)
        
        # Initialize Reader (indexes the file from local path)
        ACTIVE_READER = LazyMzmlReader(request.mzml_path)
        
        return {
            "status": "success",
            "peptides": peptides,
            "message": f"Loaded {len(peptides)} peptides from {os.path.basename(request.pin_path)}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/spectrum/{scan_nr}")
async def get_spectrum(
    scan_nr: int,
    sequence: str = Query(..., description="Peptide sequence for annotation"),
    charge: int = Query(..., description="Precursor charge for annotation"),
    tolerance: float = Query(0.5, description="Matching tolerance")
):
    global ACTIVE_READER
    
    if ACTIVE_READER is None:
        raise HTTPException(status_code=400, detail="No mzML file loaded.")
        
    try:
        # 1. Lazy load spectrum
        peaks = ACTIVE_READER.get_spectrum(scan_nr)
        
        if peaks is None:
            raise HTTPException(status_code=404, detail=f"Scan {scan_nr} not found in mzML.")
            
        # 2. Calculate Theoretical Ions
        theoretical_ions = calculate_ions(sequence, charge)
        
        # 3. Match
        matches = match_ions(peaks, theoretical_ions, tolerance)
        
        return {
            "scan_nr": scan_nr,
            "peaks": peaks,
            "matches": matches
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files (Frontend)
if os.path.exists("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
elif os.path.exists("../frontend"):
    app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")
