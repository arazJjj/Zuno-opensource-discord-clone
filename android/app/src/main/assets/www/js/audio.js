/* All sound effects are synthesized with WebAudio. Voice lines are optional user recordings. */
(function () {
  'use strict';
  const LG = window.LG;
  const A = LG.audio = { ctx: null, master: null, sfx: null, vol: 0.8, noiseBuf: null };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { A.ctx = new AC(); } catch (e) { return; }
    A.master = A.ctx.createGain(); A.master.gain.value = A.vol; A.master.connect(A.ctx.destination);
    const len = A.ctx.sampleRate; const b = A.ctx.createBuffer(1, len, A.ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; A.noiseBuf = b;
  };
  A.setVolume = function (v) { A.vol = v; if (A.master) A.master.gain.value = v; LG.voice.setVolume(v); };

  function out(vol, pan) {
    const g = A.ctx.createGain(); g.gain.value = vol;
    if (pan !== undefined && A.ctx.createStereoPanner) { const p = A.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(A.master); }
    else g.connect(A.master);
    return g;
  }
  function tone(freq, dur, type, vol, pan, slideTo, delay) {
    if (!A.ctx) return; const t = A.ctx.currentTime + (delay || 0);
    const o = A.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(vol, pan)); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, pan, freq, ftype, delay, q) {
    if (!A.ctx) return; const t = A.ctx.currentTime + (delay || 0);
    const s = A.ctx.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = ftype || 'lowpass'; f.frequency.value = freq || 1000; if (q) f.Q.value = q;
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out(vol, pan)); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  A.slap = function (vol, pan) { if (vol < 0.01) return; noise(0.07, vol * 0.9, pan, 1800, 'highpass'); tone(220, 0.06, 'square', vol * 0.35, pan, 70); noise(0.12, vol * 0.4, pan, 400, 'lowpass', 0.01); };
  A.step = function (vol, pan) { noise(0.06, vol, pan, 520, 'lowpass'); };
  A.pickup = function () { tone(660, 0.12, 'triangle', 0.35); tone(880, 0.12, 'triangle', 0.35, 0, null, 0.08); tone(1320, 0.2, 'triangle', 0.3, 0, null, 0.16); };
  A.correct = function () { tone(523, 0.12, 'square', 0.18); tone(784, 0.22, 'square', 0.18, 0, null, 0.1); };
  A.wrong = function () { tone(180, 0.35, 'sawtooth', 0.22, 0, 90); };
  A.glitch = function () { for (let i = 0; i < 8; i++) tone(100 + Math.random() * 1500, 0.05, 'square', 0.12, Math.random() * 2 - 1, null, i * 0.04); noise(0.3, 0.2, 0, 3000, 'bandpass'); };
  A.bell = function () { [0, 0.35, 0.7].forEach(function (d) { tone(1250, 0.9, 'sine', 0.3, 0, null, d); tone(1875, 0.6, 'sine', 0.15, 0, null, d); tone(2500, 0.3, 'triangle', 0.08, 0, null, d); }); };
  A.whistle = function () { tone(2300, 0.18, 'square', 0.12); tone(2500, 0.35, 'square', 0.12, 0, 2200, 0.2); };
  A.boing = function () { tone(220, 0.18, 'sine', 0.35, 0, 660); };
  A.whirr = function (vol, pan) { if (vol < 0.02) return; noise(0.16, vol * 0.5, pan, 900, 'bandpass', 0, 3); tone(110, 0.16, 'sawtooth', vol * 0.08, pan); };
  A.beep = function (vol, pan) { tone(1000, 0.08, 'square', 0.15 * (vol || 1), pan); tone(1500, 0.1, 'square', 0.15 * (vol || 1), pan, null, 0.1); };
  A.door = function (vol, pan) { if (vol < 0.02) return; noise(0.25, vol * 0.35, pan, 300, 'lowpass'); tone(90, 0.2, 'triangle', vol * 0.15, pan, 60); };
  A.lose = function () { tone(400, 0.9, 'sawtooth', 0.25, 0, 60); noise(0.8, 0.3, 0, 600, 'lowpass'); };
  A.win = function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.3, 'square', 0.16, 0, null, i * 0.14); }); tone(1046, 0.8, 'triangle', 0.2, 0, null, 0.6); };
  A.exitHit = function () { tone(392, 0.4, 'sawtooth', 0.18); tone(370, 0.6, 'sawtooth', 0.18, 0, null, 0.2); noise(0.5, 0.25, 0, 200, 'lowpass'); };
  A.drink = function () { for (let i = 0; i < 3; i++) noise(0.09, 0.3, 0, 350, 'lowpass', i * 0.13); tone(600, 0.25, 'sine', 0.15, 0, 1200, 0.4); };
  A.ui = function () { tone(900, 0.04, 'square', 0.08); };

  // Placeholder ambient escape drone (pure WebAudio) - intensity 0..1
  let drone = null;
  A.droneStart = function () {
    if (!A.ctx || drone) return;
    const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
    const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 6; f.connect(g);
    const oscs = [55, 55.7, 82.4, 110.6].map(function (fr, i) { const o = A.ctx.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
    const lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.25; const lg = A.ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    drone = { g: g, f: f, oscs: oscs, lfo: lfo, lg: lg };
  };
  A.droneLevel = function (lvl) {
    if (!drone) return; const t = A.ctx.currentTime;
    drone.g.gain.setTargetAtTime(0.06 + lvl * 0.12, t, 0.5);
    drone.f.frequency.setTargetAtTime(250 + lvl * 700, t, 0.5);
    drone.lfo.frequency.setTargetAtTime(0.25 + lvl * 2.5, t, 0.5);
    drone.oscs.forEach(function (o, i) { o.detune.setTargetAtTime(lvl * (i % 2 ? 40 : -40), t, 0.5); });
  };
  A.droneStop = function () {
    if (!drone) return; const d = drone; drone = null;
    try { d.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); setTimeout(function () { d.oscs.forEach(function (o) { o.stop(); }); d.lfo.stop(); d.g.disconnect(); }, 800); } catch (e) { }
  };

  // ---------- Voice lines (optional recordings in assets/voice/) ----------
  const V = LG.voice = { found: {}, dur: {}, vol: 0.8, current: null, probed: false };
  const EXTS = ['mp3', 'm4a', 'ogg', 'wav'];
  // name -> [speaker, subtitle text]
  V.lines = {
    intro: ['Mr. Luke', "Welcome to my school! Find my 7 iPads and answer my questions. Spelling AND technology. Easy... right?"],
    notebook_1: ['Mr. Luke', 'Wonderful! One iPad down, you little genius!'],
    notebook_2: ['Mr. Luke', 'Two iPads! You type faster than my old dial-up modem!'],
    notebook_3: ['Mr. Luke', 'Three! Now THAT is what I call a software update!'],
    notebook_4: ['Mr. Luke', 'Four iPads! Halfway there. I am so proud!'],
    notebook_5: ['Mr. Luke', 'Five! Your brain must have extra RAM!'],
    notebook_6: ['Mr. Luke', 'Six! Just one more. Do not let me down now...'],
    notebook_7: ['Mr. Luke', 'All seven! Perfect spelling. Perfect technology. Perfect student!'],
    correct: ['Mr. Luke', 'Correct!'],
    wrong: ['Mr. Luke', 'Wrong. Hmmmm.'],
    chase_start: ['Mr. Luke', "WRONG?! Oh, you've done it now. Here I come... with my RULER!"],
    caught: ['Mr. Luke', 'Gotcha! Class is dismissed... for YOU!'],
    win: ['Mr. Luke', "No! You escaped my school! ...Fine. A-plus. See you tomorrow."],
    detention: ['Principal Grant', 'No running in the halls! Detention! Fifteen seconds. Think about what you did.'],
    skippy: ['Skippy', 'Hey! Jump rope with me! Five jumps or you can\'t go!'],
    exit_start: ['Mr. Luke', "You found all my iPads... Now try to get OUT. Four exits. I'll be waiting!"],
    exit_1: ['Mr. Luke', "One exit closed! Don't get comfortable... the lights are changing."],
    exit_2: ['Mr. Luke', 'Two! I can hear your footsteps from here!'],
    exit_3: ['Mr. Luke', 'Three?! ONE more... if you can get there before ME!']
  };
  V.probeAll = function (done) {
    if (V.probed) { if (done) done(); return; }
    V.probed = true;
    const names = Object.keys(V.lines).concat(['ipad_1', 'ipad_2', 'ipad_3', 'ipad_4', 'ipad_5', 'ipad_6', 'ipad_7']);
    let pending = names.length;
    names.forEach(function (n) {
      let i = 0;
      (function tryNext() {
        if (i >= EXTS.length) { if (--pending === 0 && done) done(); return; }
        const src = 'assets/voice/' + n + '.' + EXTS[i++];
        const a = new Audio(); let settled = false;
        const ok = function () { if (settled) return; settled = true; V.found[n] = src; if (isFinite(a.duration)) V.dur[n] = a.duration; if (--pending === 0 && done) done(); };
        const bad = function () { if (settled) return; settled = true; tryNext(); };
        a.addEventListener('canplaythrough', ok, { once: true }); a.addEventListener('loadeddata', ok, { once: true }); a.addEventListener('error', bad, { once: true });
        setTimeout(bad, 2500); a.preload = 'auto'; a.src = src; try { a.load(); } catch (e) { bad(); }
      })();
    });
  };
  V.setVolume = function (v) { V.vol = v; if (V.current) V.current.volume = Math.min(1, v); };
  // play(name, opts) -> shows subtitle always; plays the recording if present
  V.play = function (name, alias) {
    const line = V.lines[name] || ['', name];
    if (LG.ui && LG.ui.sub) LG.ui.sub(line[0] + ': ' + line[1], line[0] === 'Mr. Luke' ? '#ffd54f' : line[0] === 'Principal Grant' ? '#90caf9' : '#f48fb1', Math.max(3, line[1].length * 0.06, (V.dur[name] || (alias && V.dur[alias]) || 0) + 0.4));
    const src = V.found[name] || (alias && V.found[alias]);
    if (!src) return;
    try { if (V.current) { V.current.pause(); } const a = new Audio(src); a.volume = Math.min(1, V.vol); V.current = a; const p = a.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
  };
})();
