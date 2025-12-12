/* worker_calculations.js */
import init, { calculate_ions, match_ions } from './pkg/mass_spec_wasm.js';

let wasmInitialized = false;

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    try {
        if (!wasmInitialized) {
            await init();
            wasmInitialized = true;
        }

        if (type === 'CALC_AND_MATCH') {
            const { sequence, charge, peaks, tolerance, tolUnit = "Da" } = payload;

            // Wasm expects specific types.
            // calculate_ions(sequence: &str, charge: i32) -> JsValue (Array of Ion)
            // match_ions(peaks: JsValue, theoretical: JsValue, tolerance: f64) -> JsValue (Array of Match)

            // Wasm Bindgen handles JS Objects <-> Rust Structs via Serde.
            // But we must ensure 'peaks' is what Rust expects (Vec<Peak>).
            // Rust Peak: { mz: f64, intensity: f64 }
            // Our JS peaks have exactly this structure.

            const theoretical = calculate_ions(sequence, charge);
            const matches = match_ions(peaks, theoretical, tolerance, tolUnit);

            self.postMessage({
                type: 'MATCH_RESULT',
                payload: { matches } // Also return theoretical?
                // The frontend plot needs theoretical? Or just matches?
                // app.js renderPlot needed 'matches'.
                // If we want to show theoretical ticks, we might need them.
                // Rust 'match_ions' returns 'matches'.
                // Let's return just matches as requested by app.js logic so far.
            });
        }
    } catch (err) {
        self.postMessage({ type: 'ERROR', payload: err.message });
        console.error(err);
    }
};
