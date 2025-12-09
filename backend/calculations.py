import re

# Standard atomic weights
ATOM_MASSES = {
    "H": 1.007825035,
    "C": 12.0000000,
    "N": 14.0030740,
    "O": 15.9949146,
    "S": 31.9720707,
}

# Amino acid monoisotopic masses (residue masses)
AA_MASSES = {
    "A": 71.03711,
    "R": 156.10111,
    "N": 114.04293,
    "D": 115.02694,
    "C": 103.00919,
    "E": 129.04259,
    "Q": 128.05858,
    "G": 57.02146,
    "H": 137.05891,
    "I": 113.08406,
    "L": 113.08406,
    "K": 128.09496,
    "M": 131.04049,
    "F": 147.06841,
    "P": 97.05276,
    "S": 87.03203,
    "T": 101.04768,
    "W": 186.07931,
    "Y": 163.06333,
    "V": 99.06841,
}

PROTON_MASS = ATOM_MASSES["H"]
H2O_MASS = 2 * ATOM_MASSES["H"] + ATOM_MASSES["O"]

def parse_spectrum(spectrum_text: str):
    """
    Parses a string of 'mass intensity' lines into a list of dicts.
    """
    peaks = []
    for line in spectrum_text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            # Handle space or tab separation
            parts = re.split(r'\s+', line)
            if len(parts) >= 2:
                mz = float(parts[0])
                intensity = float(parts[1])
                peaks.append({"mz": mz, "intensity": intensity})
        except ValueError:
            continue
    return peaks

def calculate_ions(sequence: str, charge: int):
    """
    Calculates theoretical b and y ions for the given sequence and charge state.
    Returns a list of ion dictionaries: { "type": "b1", "mz": 123.4, "charge": 1 }
    """
    sequence = sequence.upper()
    n_term_mass = ATOM_MASSES["H"]
    c_term_mass = ATOM_MASSES["H"] + ATOM_MASSES["O"]
    
    ions = []
    
    # Pre-calculate prefix masses for b-ions
    # b-ion = sum(residues) + H (from N-term? No, b-ion structure is acylium usually, so let's stick to standard definition)
    # Standard definition:
    # b_n = sum(residue masses 1 to n) + H (if single charge protonated)
    # Actually, b1 is usually just the residue + H? 
    # Let's verify standard proteomics nomenclature.
    # b_i: N-terminal fragment. Mass = sum(aa) + 1 (proton) ?
    # y_i: C-terminal fragment. Mass = sum(aa) + H2O + 1 (proton) ?
    #
    # Wait, if we are doing electrospray, we have M protons total distributed.
    # Often for theoretical generation we just generate singly charged ions, or up to the precursor charge.
    
    # Correct formulas for neutral masses:
    # M_b(i) = sum(aa_1...aa_i) 
    # M_y(i) = sum(aa_n-i+1...aa_n) + H2O
    
    # To get m/z for charge z:
    # mz = (M_neutral + z * H+) / z
    
    prefix_mass = 0
    total_mass = sum(AA_MASSES.get(aa, 0.0) for aa in sequence)
    
    for i in range(len(sequence)):
        # 1-based index length of the fragment
        length = i + 1
        aa = sequence[i]
        
        # Add mass of current residue
        prefix_mass += AA_MASSES.get(aa, 0.0)
        
        # --- b-ions ---
        # b-ions include the N-terminus but NOT the C-terminal OH.
        # So Neutral Mass b = prefix_mass - (if we consider cyclic structure? Standard is just sum(aa) usually treated as R-CO-...)
        # Actually standard definition:
        # b-ion neutral mass = sum(residue masses) 
        # (It lacks the OH of the carboxyl group, and has the H of the N-term amine... wait.)
        #
        # Let's count atoms:
        # Glycine residue: -NH-CH2-CO- (57.02)
        # Free Glycine: NH2-CH2-COOH (75.03) -> Difference is H2O (18.01)
        #
        # b1 ion (Acylium): NH2-CH2-C+=O -> Mass 57.02 + 1.008 (H) = 58.03 ?? No.
        # 
        # Let's stick to the simplest "Roepstorff and Fohlman" nomenclature which is standard.
        # b ions extend from N-terminus. Charge resides on N-term usually.
        # y ions extend from C-terminus. Charge resides on C-term usually.
        #
        # Neutral Mass(b_i) = Sum(residues 1..i)
        # Neutral Mass(y_j) = Sum(residues n-j+1..n) + H2O
        #
        # MZ = (NeutralMass + z * 1.0078) / z
        
        if length < len(sequence): # b-ions usually don't include the full sequence (that's precursor)
             neutral_mass_b = prefix_mass
             # Calculate for charges 1 up to 'charge' (precursor charge)
             # Usually fragments are 1+ or maybe 2+ if precursor is high. 
             # Let's generate 1+ and 2+ for now, or up to precursor charge.
             for z in range(1, charge + 1):
                 mz = (neutral_mass_b + z * PROTON_MASS) / z
                 ions.append({
                     "type": f"b{length}",
                     "charge": z,
                     "mz": mz,
                     "neutral_mass": neutral_mass_b    
                 })

        # --- y-ions ---
        # y-ions are the reverse complement
        # We can calculate them by subtracting the prefix mass from the total mass?
        # Total Neutral Sequence Mass (M) = Sum(all aa) + H2O
        # Neutral Mass(y_j) where j is length from C-term
        # y_j matches to the suffix of length j.
        # Corresponds to removing the prefix of length (n-j).
        # So Neutral Mass(y_j) = Total_Residu_Mass - prefix_mass(of n-j) + H2O
        
        suffix_len = len(sequence) - length
        if suffix_len > 0:
             # prefix_mass currently holds sum(0..i) which is length residues.
             # remaining residues = total - prefix
             neutral_mass_y = (total_mass - prefix_mass) + H2O_MASS
             
             # y-ion index is usually the length of the suffix
             y_index = suffix_len
             
             for z in range(1, charge + 1):
                 mz = (neutral_mass_y + z * PROTON_MASS) / z
                 ions.append({
                     "type": f"y{y_index}",
                     "charge": z,
                     "mz": mz,
                     "neutral_mass": neutral_mass_y
                 })

    return ions

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
        
        # Find closest peak
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
