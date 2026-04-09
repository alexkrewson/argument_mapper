/**
 * sounds.js — Game mode sound effects via Web Audio API.
 * All sounds are synthesized; no audio files needed.
 */

let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Resume suspended context (browsers suspend until user gesture)
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Happy ascending arpeggio — good outcome. */
export function playHappy() {
  try {
    const ac = getCtx();
    // C5 – E5 – G5 – C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ac.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  } catch { /* audio unavailable */ }
}

/** Short celebratory fanfare — big win (self-concession). */
export function playBigWin() {
  try {
    const ac = getCtx();
    // C5 – G5 – C6 – E6 – G6
    const notes = [523.25, 783.99, 1046.50, 1318.51, 1567.98];
    notes.forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = ac.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch { /* audio unavailable */ }
}

/** Sad descending minor tones — bad outcome. */
export function playSad() {
  try {
    const ac = getCtx();
    // Eb4 – C4 – A3 — descending minor feel
    const notes = [311.13, 261.63, 220.00];
    notes.forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const t = ac.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch { /* audio unavailable */ }
}
