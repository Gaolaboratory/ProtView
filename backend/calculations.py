import numpy as np
from functools import lru_cache
from typing import List

# Standard atomic weights and masses
ATOM_MASSES = {
    "H": 1.007825035,
    "O": 15.9949146,
}

PROTON_MASS = ATOM_MASSES["H"]
H2O_MASS = 2 * ATOM_MASSES["H"] + ATOM_MASSES["O"]

# User provided masses
AA_MASS = {'G': 57.02146374, 'A': 71.03711381, 'S': 87.03202844, 'P': 97.05276388, 'V': 99.06841395, 'T': 101.0476785, 'C': 103.0091845, 'L': 113.084064, 'I': 113.084064, 'N': 114.0429275,
               'D': 115.0269431,
               'Q': 128.0585775, 'K': 128.0949631, 'E': 129.0425931, 'M': 131.0404846, 'H': 137.0589119, 'F': 147.0684139, 'U': 150.9536334, 'R': 156.1011111, 'Y': 163.0633286, 'W': 186.079313,
               'O': 237.1477269, 'n': 0.00000}

@lru_cache(maxsize=50000)
def pep_by_ion_calc(peptide: str) -> np.ndarray:
    """
    Calculates b and y ions for a peptide sequence, handling [mass] or (mass) modifications.
    Returns concatenated array of b-ions then y-ions.
    """
    b_ion_vals = []
    
    i = 0
    n = len(peptide)
    pending_mod = 0.0
    
    while i < n:
        char = peptide[i]
        
        if char in ['[', '(']:
            # Parse modification
            target_end = ']' if char == '[' else ')'
            j = i + 1
            while j < n and peptide[j] != target_end:
                j += 1
            
            if j < n:
                try:
                    # Extract mass between delimiters
                    mod_str = peptide[i+1:j]
                    mod = float(mod_str)
                    
                    if b_ion_vals:
                         # Modify previous residue
                         b_ion_vals[-1] += mod
                    else:
                         # Modification at start (N-term)
                         pending_mod += mod
                except ValueError:
                    pass
            i = j + 1
            
        elif char in AA_MASS:
            mass = AA_MASS[char]
            if pending_mod != 0:
                mass += pending_mod
                pending_mod = 0
            b_ion_vals.append(mass)
            i += 1
        else:
            i += 1
            
    b_ions_arr = np.array(b_ion_vals)
    if len(b_ions_arr) == 0:
        return np.array([])
        
    # b1 = aa1 + H+
    b_ions_arr[0] += PROTON_MASS
    
    # Cumulative sum
    b_ions_cumulative = np.cumsum(b_ions_arr)
    
    total_mh = b_ions_cumulative[-1] + (18.010564684) # WATER
    
    # y_ions calculation matching user logic
    y_ions = total_mh - b_ions_cumulative + PROTON_MASS
    
    # Override last y-ion to be total mass (y_n)
    y_ions[-1] = total_mh
    
    return np.concatenate((b_ions_cumulative, y_ions), axis=0)

def calculate_ions(sequence: str, charge: int) -> List[dict]:
    """
    Calculates theoretical ions using the robust PTM parser.
    """
    # 1. Parse and calculate base (singly charged) ions
    # The result array has [b1...bn, y(n-1)...y1??]
    # We need to identify which is which.
    
    # Calculate pure lengths without mods for labeling
    # We need to know how many residues.
    # We can run the parser again or just use the length of b_ions (half the array).
    
    masses = pep_by_ion_calc(sequence)
    
    if len(masses) == 0:
        return []
        
    num_residues = len(masses) // 2
    b_masses = masses[:num_residues]
    y_masses = masses[num_residues:]
    
    ions = []
    
    # Generate b-ions
    for i, m in enumerate(b_masses):
        # b1, b2 ...
        ion_idx = i + 1
        for z in range(1, charge + 1):
             # m is singly charged (MH+)
             # m = Neutral + H
             # mz = (Neutral + zH) / z = (m - H + zH) / z = (m + (z-1)H) / z
             mz = (m + (z - 1) * PROTON_MASS) / z
             ions.append({
                 "type": f"b{ion_idx}",
                 "charge": z,
                 "mz": mz
             })

    # Generate y-ions
    # y_masses from user code:
    # y[0] corresponds to removing b1 -> y_(n-1)
    # y[-1] corresponds to full mass -> y_n
    
    # Wait, usually:
    # y1 is suffix length 1.
    # User code: y = M - b + H.
    # If b=b1 (prefix 1), y = M - b1 + H = (ResTotal + H2O + H) - (Res1 + H) + H = ResSuffix + H2O + H.
    # This is MH+ of suffix length (n-1). = y_(n-1).
    
    # So y_masses[0] is y_(n-1)
    # y_masses[-1] is y_(0)? No users code set y[-1] = total. So y_n.
    
    # Let's map indices:
    # i goes 0 to n-1.
    # len = n_residues.
    # y_index = n_residues - (i + 1) ? 
    # No, if i=0 (b1), we get y_(n-1).
    # If i = n-1 (bn), we get y_0? (which is usually not valid, or H2O+H)
    
    # User code override y[-1] = total. Total is y_n.
    # So y_masses is [y_n-1, y_n-2, ... y_1? ... y_n?]
    # This order is confusing.
    
    # Let's simple check user logic: `y_ions = total - b + H`.
    # b is [b1, b2, ... bn]
    # y is [y(n-1), y(n-2), ... y0]
    
    # So:
    # i=0: b1 -> y(n-1)
    # i=n-2: b(n-1) -> y1
    # i=n-1: bn -> y0 (replaced by y_n)
    
    for i, m in enumerate(y_masses):
        if i == num_residues - 1:
            ion_label = f"y{num_residues}" # The override (Full peptide)
        else:
            ion_label = f"y{num_residues - 1 - i}"
            
        # Filter mostly y0?
        if ion_label == "y0": continue
        
        for z in range(1, charge + 1):
             mz = (m + (z - 1) * PROTON_MASS) / z
             ions.append({
                 "type": ion_label,
                 "charge": z,
                 "mz": mz
             })
             
    return ions

def parse_spectrum(spectrum_text: str):
    import re
    peaks = []
    for line in spectrum_text.strip().splitlines():
        line = line.strip()
        if not line: continue
        try:
            parts = re.split(r'\s+', line)
            if len(parts) >= 2:
                peaks.append({"mz": float(parts[0]), "intensity": float(parts[1])})
        except: pass
    return peaks

def match_ions(peaks, theoretical_ions, tolerance=0.5):
    """
    Matches theoretical ions to observed peaks within a tolerance (Da).
    Greedy matching: for each theoretical ion, find the closest observed peak.
    Returns list of matched annotations.
    """
    matches = []
    # Sort peaks by intensity? Or just iterate?
    # Iterate theoretical ions
    for ion in theoretical_ions:
        target_mz = ion["mz"]
        
        best_peak = None
        min_diff = float('inf')
        
        for peak in peaks:
            diff = abs(peak["mz"] - target_mz)
            if diff <= tolerance and diff < min_diff:
                min_diff = diff
                best_peak = peak
        
        if best_peak:
            # Check if this annotation already exists for this peak?
            # A peak might be multiple things? 
            # For simplicity, let's just add the match. 
            # The frontend can handle overlapping labels.
            matches.append({
                "peak_mz": best_peak["mz"],
                "peak_intensity": best_peak["intensity"],
                "ion_type": ion["type"],
                "ion_charge": ion["charge"],
                "theoretical_mz": ion["mz"],
                "error": min_diff
            })
            
    return matches

