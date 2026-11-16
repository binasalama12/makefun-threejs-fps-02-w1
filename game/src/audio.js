// All sound is synthesised with WebAudio: short oscillator blips for gunfire and UI,
// filtered noise for the charge blast. No audio files are ever loaded.
export function createAudio() {
  let ctx = null;
  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, gain, slideTo) {
    const ac = ensure(); if (!ac) return;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ac.currentTime + dur);
    amp.gain.setValueAtTime(gain || 0.08, ac.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + dur);
  }
  function noise(dur, gain, freq) {
    const ac = ensure(); if (!ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = freq || 900;
    const amp = ac.createGain(); amp.gain.value = gain || 0.2;
    src.connect(filter).connect(amp).connect(ac.destination);
    src.start();
  }
  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'heavy') { tone(120, 0.16, 'sawtooth', 0.16, 40); noise(0.12, 0.18, 700); }
      else if (kind === 'scatter') { noise(0.18, 0.26, 600); tone(90, 0.14, 'square', 0.1, 45); }
      else { tone(220, 0.07, 'square', 0.09, 70); noise(0.05, 0.1, 1600); }
    },
    foeShot() { tone(160, 0.06, 'square', 0.045, 60); },
    reload() { tone(320, 0.05, 'square', 0.06); setTimeout(() => tone(240, 0.05, 'square', 0.06), 120); },
    hit(head) {
      // Headshots get an unmistakable double-ping an octave above the body tick,
      // so a cranial hit reads by ear alone in the middle of a burst.
      if (head) { tone(1318, 0.05, 'sine', 0.13); setTimeout(() => tone(1760, 0.08, 'sine', 0.13), 45); }
      else tone(520, 0.06, 'sine', 0.1);
    },
    hurt() { tone(110, 0.12, 'sawtooth', 0.1, 60); },
    buy() { tone(660, 0.07, 'sine', 0.09); setTimeout(() => tone(990, 0.09, 'sine', 0.09), 70); },
    denied() { tone(140, 0.12, 'square', 0.08); },
    beep(final) { tone(final ? 1320 : 880, final ? 0.3 : 0.08, 'sine', 0.1); },
    plant() { tone(520, 0.09, 'sine', 0.09); setTimeout(() => tone(780, 0.12, 'sine', 0.09), 110); },
    boom() { noise(0.9, 0.5, 320); tone(60, 0.8, 'sine', 0.3, 28); },
    roundEnd(win) { tone(win ? 523 : 330, 0.14, 'sine', 0.09); setTimeout(() => tone(win ? 784 : 262, 0.2, 'sine', 0.09), 140); },
    throwWhoosh() { noise(0.16, 0.07, 2400); },
    smokeHiss() { noise(1.15, 0.11, 3400); },
  };
}
