use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use base64::{Engine as _, engine::general_purpose};
use std::io::Read;
use flate2::read::ZlibDecoder;

// Data Structures
#[derive(Serialize, Deserialize)]
pub struct Peak {
    pub mz: f64,
    pub intensity: f64,
}

#[derive(Serialize, Deserialize)]
pub struct Ion {
    pub type_: String, // "b1", "y3"
    pub charge: i32,
    pub mz: f64,
}

#[derive(Serialize, Deserialize)]
pub struct MatchResult {
    pub peak_mz: f64,
    pub peak_intensity: f64,
    pub ion_type: String,
    pub ion_charge: i32,
    pub theoretical_mz: f64,
    pub error: f64,
}

// Atomic Masses
const PROTON_MASS: f64 = 1.007825035;
const H2O_MASS: f64 = 18.010564684;

#[wasm_bindgen]
pub fn calculate_ions(sequence: &str, charge: i32) -> JsValue {
    let ions = calc_ions_internal(sequence, charge);
    serde_wasm_bindgen::to_value(&ions).unwrap()
}

#[wasm_bindgen]
pub fn parse_spectrum(xml_str: &str) -> JsValue {
    let peaks = parse_spectrum_internal(xml_str);
    serde_wasm_bindgen::to_value(&peaks).unwrap()
}

#[wasm_bindgen]
pub fn match_ions(peaks_val: JsValue, theoretical_val: JsValue, tolerance: f64, tol_unit: String) -> JsValue {
    let peaks: Vec<Peak> = serde_wasm_bindgen::from_value(peaks_val).unwrap();
    let theoretical: Vec<Ion> = serde_wasm_bindgen::from_value(theoretical_val).unwrap();
    
    let mut matches = Vec::new();
    
    for ion in theoretical {
        // Calculate effective tolerance
        let eff_tol = if tol_unit == "ppm" {
            tolerance * ion.mz / 1_000_000.0
        } else {
            tolerance
        };

        let mut best_peak: Option<&Peak> = None;
        let mut min_diff = f64::INFINITY;
        
        for peak in &peaks {
            let diff = (peak.mz - ion.mz).abs();
            if diff <= eff_tol && diff < min_diff {
                min_diff = diff;
                best_peak = Some(peak);
            }
        }
        
        if let Some(p) = best_peak {
            matches.push(MatchResult {
                peak_mz: p.mz,
                peak_intensity: p.intensity,
                ion_type: ion.type_.clone(),
                ion_charge: ion.charge,
                theoretical_mz: ion.mz,
                error: min_diff,
            });
        }
    }
    
    serde_wasm_bindgen::to_value(&matches).unwrap()
}

// Internal Logic
fn calc_ions_internal(sequence: &str, charge: i32) -> Vec<Ion> {
    // Port of pep_by_ion_calc
    let aa_mass = get_aa_masses();
    let mut b_ions_cumulative = Vec::new();
    
    let mut current_mass = 0.0;
    let mut pending_mod = 0.0;
    
    let chars: Vec<char> = sequence.chars().collect();
    let mut i = 0;
    
    while i < chars.len() {
        let c = chars[i];
        if c == '[' || c == '(' {
            // Find end
            let target = if c == '[' { ']' } else { ')' };
            let mut j = i + 1;
            while j < chars.len() && chars[j] != target {
                j += 1;
            }
            if j < chars.len() {
                let mod_str: String = chars[i+1..j].iter().collect();
                if let Ok(val) = mod_str.parse::<f64>() {
                    if !b_ions_cumulative.is_empty() {
                         let last = b_ions_cumulative.len() - 1;
                         b_ions_cumulative[last] += val;
                         current_mass += val;
                    } else {
                        pending_mod += val;
                    }
                }
            }
            i = j + 1;
        } else if let Some(&mass) = aa_mass.get(&c) {
             let mut m = mass;
             if pending_mod != 0.0 {
                 m += pending_mod;
                 pending_mod = 0.0;
             }
             current_mass += m;
             b_ions_cumulative.push(current_mass);
             i += 1;
        } else {
            i += 1;
        }
    }
    
    if b_ions_cumulative.is_empty() { return vec![]; }
    
    // b1 = aa1 + H+
    // But b_ions_cumulative is strictly sum(AA). 
    // b-ion[i] = sum(0..i) + H+
    
    let mut results = Vec::new();
    let n = b_ions_cumulative.len();
    

    
    // Apply proton to first in list
    for b in &mut b_ions_cumulative {
        *b += PROTON_MASS;
    }
    
    // Total MH+ = Sum(AA + H) + OH (from water) ?
    // Actually b_last is Sum(AA) + H (N-term).
    // Need to add OH (17.002...)?
    // PROTON_MASS (1.007) + 15.99... = 17.
    // H2O_MASS is 18.01 (2H+O).
    // Let's rely on constants.
    
    let total_mh_val = b_ions_cumulative[n-1] + 18.010564684; // Using specific water mass from Python code
    
    // Y ions
    let mut y_ions = Vec::new();
    for b in &b_ions_cumulative {
        y_ions.push(total_mh_val - b + PROTON_MASS);
    }
    // Set last to total
    let y_len = y_ions.len();
    y_ions[y_len-1] = total_mh_val;
    
    // Generate Ion objects ... (omitted, assuming rest is fine)
    // Actually I need to replace the whole function content to be safe or target specific lines.
    // I will target the 'calc_ions_internal' end part.
    
    // Resume function ...
    for (i, &m) in b_ions_cumulative.iter().enumerate() {
        let idx = i + 1;
        for z in 1..=charge {
            let mz = (m + (z as f64 - 1.0) * PROTON_MASS) / z as f64;
             results.push(Ion { type_: format!("b{}", idx), charge: z, mz });
        }
    }
    
    for (i, &m) in y_ions.iter().enumerate() {
        let label = if i == n - 1 {
            format!("y{}", n)
        } else {
             format!("y{}", n - 1 - i)
        };
        
        if label == "y0" { continue; }
        
        for z in 1..=charge {
            let mz = (m + (z as f64 - 1.0) * PROTON_MASS) / z as f64;
             results.push(Ion { type_: label.clone(), charge: z, mz });
        }
    }
    
    results
}

fn parse_spectrum_internal(xml: &str) -> Vec<Peak> {
    let mut reader = Reader::from_str(xml);


    let mut mz_array: Vec<f32> = Vec::new();
    let mut int_array: Vec<f32> = Vec::new();
    
    // State
    let mut in_binary = false;
    let mut is_mz = false;
    let mut is_int = false;
    let mut is_zlib = false;
    let mut is_64 = false;
    
    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let name = e.name();
                let name_bytes = name.as_ref();
                
                // Use ends_with to handle optional namespaces (e.g. mzml:binaryDataArray)
                if name_bytes.ends_with(b"binaryDataArray") {
                        // Reset flags
                        is_mz = false;
                        is_int = false;
                        is_zlib = false;
                        is_64 = false;
                } else if name_bytes.ends_with(b"cvParam") {
                        // Check attributes
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                let val = std::str::from_utf8(&a.value).unwrap_or("");
                                let key_bytes = a.key.as_ref();
                                let key = std::str::from_utf8(key_bytes).unwrap_or("");
                                
                                if key.ends_with("accession") {
                                    match val {
                                        "MS:1000514" => is_mz = true,
                                        "MS:1000515" => is_int = true,
                                        "MS:1000574" => is_zlib = true,
                                        "MS:1000523" => is_64 = true,
                                        _ => {}
                                    }
                                }
                                if key.ends_with("name") {
                                    if val.contains("m/z array") { is_mz = true; }
                                    if val.contains("intensity array") { is_int = true; }
                                    if val.contains("zlib") { is_zlib = true; }
                                    if val.contains("64-bit") { is_64 = true; }
                                }
                            }
                        }
                } else if name_bytes.ends_with(b"binary") {
                        in_binary = true;
                }
            },
            Ok(Event::Text(e)) => {
                if in_binary && (is_mz || is_int) {
                    let txt = e.unescape().unwrap();
                    // Remove whitespace (newlines are common in XML base64)
                    let txt_clean: String = txt.chars().filter(|c| !c.is_whitespace()).collect();
                    
                    let decoded_res = general_purpose::STANDARD.decode(txt_clean.as_bytes());
                    if let Ok(decoded) = decoded_res {
                        let bytes = if is_zlib {
                            let mut d = ZlibDecoder::new(&decoded[..]);
                            let mut buffer = Vec::new();
                            if d.read_to_end(&mut buffer).is_ok() {
                                buffer
                            } else {
                                decoded 
                            }
                        } else {
                            decoded
                        };
                        
                        // Parse float
                        if is_64 {
                            let floats: Vec<f64> = bytes.chunks_exact(8)
                                .map(|b| f64::from_le_bytes(b.try_into().unwrap()))
                                .collect();
                            let floats_converted: Vec<f32> = floats.iter().map(|&x| x as f32).collect();
                            if is_mz { mz_array = floats_converted; }
                            else { int_array = floats_converted; }
                        } else {
                            let floats: Vec<f32> = bytes.chunks_exact(4)
                                .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
                                .collect();
                            if is_mz { mz_array = floats; }
                            else { int_array = floats; }
                        }
                    }
                }
            },
            Ok(Event::End(ref e)) => {
                if e.name().as_ref() == b"binary" {
                    in_binary = false;
                }
            },
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => (),
        }

    }
    
    // Zip
    let mut peaks = Vec::new();
    let n = std::cmp::min(mz_array.len(), int_array.len());
    for i in 0..n {
        peaks.push(Peak { mz: mz_array[i] as f64, intensity: int_array[i] as f64 });
    }
    
    peaks
}

fn get_aa_masses() -> std::collections::HashMap<char, f64> {
    let mut m = std::collections::HashMap::new();
    m.insert('G', 57.02146374); m.insert('A', 71.03711381); m.insert('S', 87.03202844); m.insert('P', 97.05276388);
    m.insert('V', 99.06841395); m.insert('T', 101.0476785); m.insert('C', 103.0091845); m.insert('L', 113.084064);
    m.insert('I', 113.084064); m.insert('N', 114.0429275); m.insert('D', 115.0269431); m.insert('Q', 128.0585775);
    m.insert('K', 128.0949631); m.insert('E', 129.0425931); m.insert('M', 131.0404846); m.insert('H', 137.0589119);
    m.insert('F', 147.0684139); m.insert('U', 150.9536334); m.insert('R', 156.1011111); m.insert('Y', 163.0633286);
    m.insert('W', 186.079313); m.insert('O', 237.1477269);
    m
}
