from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import os

from .calculations import parse_spectrum, calculate_ions, match_ions

app = FastAPI()

# Input model
class AnnotationRequest(BaseModel):
    spectrum: str
    sequence: str
    charge: int
    tolerance: float = 0.5

class Peak(BaseModel):
    mz: float
    intensity: float

class IonMatch(BaseModel):
    peak_mz: float
    peak_intensity: float
    ion_type: str
    ion_charge: int
    theoretical_mz: float
    error: float

class AnnotationResponse(BaseModel):
    peaks: List[Peak]
    matches: List[IonMatch]

@app.post("/api/annotate", response_model=AnnotationResponse)
async def annotate_spectrum(request: AnnotationRequest):
    try:
        # 1. Parse spectrum
        peaks = parse_spectrum(request.spectrum)
        if not peaks:
            raise HTTPException(status_code=400, detail="Invalid spectrum data provided.")

        # 2. Calculate theoretical ions
        # Validate sequence
        valid_aa = set("ACDEFGHIKLMNPQRSTVWY")
        if not all(aa.upper() in valid_aa for aa in request.sequence):
             raise HTTPException(status_code=400, detail="Invalid amino acid sequence.")

        theoretical_ions = calculate_ions(request.sequence, request.charge)

        # 3. Match
        matches = match_ions(peaks, theoretical_ions, request.tolerance)
        
        return {
            "peaks": peaks,
            "matches": matches
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files (Frontend)
# We assume the frontend folder is in the parent directory relative to this file's execution, 
# or simpler: verify where we run it.
# If running from root `mass_spec_app`:
if os.path.exists("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
elif os.path.exists("../frontend"):
    app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

