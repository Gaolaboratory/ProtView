import pandas as pd
import os

def parse_pin(file_path: str) -> list:
    """
    Parses a .pin file (TSV format) from a local file path.
    
    Args:
        file_path: Absolute path to the .pin file.
        
    Returns:
        List of dictionaries containing peptide metadata.
    """
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PIN file not found: {file_path}")

        # Read TSV from file path
        try:
            df = pd.read_csv(file_path, sep='\t', on_bad_lines='skip')
        except Exception:
             # Fallback engine
             df = pd.read_csv(file_path, sep='\t', engine='python')

        peptides = []
        
        # Identify charge columns
        charge_cols = [c for c in df.columns if c.startswith('charge_')]
        
        # Check standard columns
        required_cols = ['ScanNr', 'Peptide']
        for col in required_cols:
            if col not in df.columns:
                 # Try case insensitive mapping if needed, or error
                 pt_map = {c.lower(): c for c in df.columns}
                 if col.lower() in pt_map:
                     df.rename(columns={pt_map[col.lower()]: col}, inplace=True)
        
        for _, row in df.iterrows():
            # Determine charge state
            charge = 2 # Default fallback
            for col in charge_cols:
                if row[col] == 1:
                    try:
                        parts = col.split('_')
                        if len(parts) >= 2 and parts[1].isdigit():
                            charge = int(parts[1])
                    except ValueError:
                        pass
                    break
            
            peptide_seq = str(row.get('Peptide', ''))
            # Clean peptide sequence (remove flanking AA like R.ACDE.K)
            if '.' in peptide_seq:
                peptide_seq = peptide_seq[2:-3]
            
            # Replace brackets with parentheses for frontend compatibility
            peptide_seq = peptide_seq.replace('[', '(').replace(']', ')')

                
            item = {
                "scan_nr": int(row.get('ScanNr', 0)),
                "spec_id": str(row.get('SpecId', '')),
                "sequence": peptide_seq,
                "charge": charge
            }
            peptides.append(item)
            
        return peptides

    except Exception as e:
        print(f"Error parsing PIN file: {e}")
        return []
