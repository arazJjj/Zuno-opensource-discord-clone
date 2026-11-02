// Zuno sounds: all made live with Web Audio, no sound files needed.
window.Z = (() => {
  let ctx = null; let ringTimer = null;
  const prefs = () => { try { return JSON.parse(localStorage.zunoSounds || '{}'); } catch { return {}; } };
  const setPref = (k, v) => { const p = prefs(); p[k] = v; localStorage.zunoSounds = JSON.stringify(p); };
  const ac = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, () => { try { ac(); } catch {} }, { once: true, passive: true }));
  // notes: [freq, startOffset, duration, type]
  function play(notes, vol = 1) {
    const c = ac(); const master = (prefs().volume ?? 0.6) * vol; const t0 = c.currentTime + 0.01;
    for (const [f, at, d, type = 'sine', f2] of notes) {
      const o = c.createOscillator(); const g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0 + at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + at + d);
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.25 * master, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
      o.connect(g).connect(c.destination); o.start(t0 + at); o.stop(t0 + at + d + 0.05);
    }
  }
  const SOUNDS = {
    message: [[880, 0, 0.12], [1320, 0.07, 0.18]],
    soft: [[660, 0, 0.08]],
    mention: [[988, 0, 0.1, 'triangle'], [1319, 0.09, 0.1, 'triangle'], [1760, 0.18, 0.22, 'triangle']],
    join: [[523, 0, 0.12], [784, 0.1, 0.2]],
    leave: [[784, 0, 0.12], [523, 0.1, 0.2]],
    mute: [[440, 0, 0.09, 'square'], [330, 0.08, 0.12, 'square']],
    unmute: [[330, 0, 0.09, 'square'], [440, 0.08, 0.12, 'square']],
    deafen: [[392, 0, 0.12, 'triangle', 196]],
    undeafen: [[196, 0, 0.12, 'triangle', 392]],
    hangup: [[600, 0, 0.15, 'sine', 300], [300, 0.16, 0.2]],
    stream: [[660, 0, 0.1], [880, 0.08, 0.1], [1100, 0.16, 0.15]],
  };
  const group = { message: 'message', soft: 'message', mention: 'mention', join: 'voice', leave: 'voice', mute: 'voice', unmute: 'voice', deafen: 'voice', undeafen: 'voice', hangup: 'voice', stream: 'voice' };
  function sound(name, force) {
    try { if (!force && prefs()[group[name]] === false) return; if (window.ZV?.deaf && name !== 'undeafen' && name !== 'deafen') return; play(SOUNDS[name] || SOUNDS.soft); } catch {}
  }
  function ring(on) {
    clearInterval(ringTimer); ringTimer = null;
    if (!on || prefs().ring === false) return;
    const once = () => play([[784, 0, 0.18, 'triangle'], [988, 0.2, 0.18, 'triangle'], [1175, 0.4, 0.3, 'triangle'], [784, 1.0, 0.18, 'triangle'], [988, 1.2, 0.18, 'triangle'], [1175, 1.4, 0.3, 'triangle']], 1.2);
    try { once(); } catch {} ringTimer = setInterval(() => { try { once(); } catch {} }, 3000);
    if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
  }
  return { sound, ring, prefs, setPref, ac };
})();
