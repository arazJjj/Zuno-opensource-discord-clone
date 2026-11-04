/* Procedural canvas textures & character sprites. All art is original, drawn in code. */
(function () {
  'use strict';
  const LG = window.LG = window.LG || {};
  const T = LG.tex = {};

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { let s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function grain(ctx, w, h, amt, seed) {
    const r = rng(seed || 7); const im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 0) continue; const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(im, 0, 0);
  }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function ell(x, X, Y, rx, ry) { x.beginPath(); x.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); }
  T.cv = cv; T.rng = rng; T.rr = rr; T.ell = ell;

  T.toTex = function (c, opts) {
    opts = opts || {};
    const t = new THREE.CanvasTexture(c);
    if (opts.sprite) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
    else { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; }
    return t;
  };

  // ---------- environment ----------
  T.hallFloor = function () {
    const c = cv(128, 128), x = c.getContext('2d');
    const cols = ['#d9d3bf', '#a9b9c2'];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { x.fillStyle = cols[(i + j) % 2]; x.fillRect(i * 64, j * 64, 64, 64); }
    const r = rng(11);
    for (let k = 0; k < 140; k++) { x.fillStyle = 'rgba(60,60,50,' + (r() * 0.25) + ')'; x.fillRect(r() * 128, r() * 128, 2, 2); }
    x.strokeStyle = '#7d7a6e'; x.lineWidth = 2; x.strokeRect(1, 1, 126, 126); x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke();
    grain(x, 128, 128, 16, 3); return c;
  };
  T.carpet = function (base, fleck, seed) {
    const c = cv(128, 128), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    const r = rng(seed || 5);
    for (let k = 0; k < 900; k++) { x.fillStyle = r() < 0.5 ? fleck : 'rgba(0,0,0,0.18)'; x.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
    grain(x, 128, 128, 26, seed + 1); return c;
  };
  T.woodFloor = function () {
    const c = cv(128, 128), x = c.getContext('2d'); const r = rng(21);
    for (let i = 0; i < 8; i++) { const b = 110 + r() * 40; x.fillStyle = 'rgb(' + (b + 30 | 0) + ',' + (b - 10 | 0) + ',' + (b - 55 | 0) + ')'; x.fillRect(0, i * 16, 128, 16); x.fillStyle = 'rgba(40,20,5,0.6)'; x.fillRect(0, i * 16, 128, 1); x.fillRect((r() * 128) | 0, i * 16, 1, 16); }
    for (let k = 0; k < 60; k++) { x.fillStyle = 'rgba(60,30,10,0.25)'; x.fillRect(r() * 128, r() * 128, 6 + r() * 20, 1); }
    grain(x, 128, 128, 14, 4); return c;
  };
  T.concrete = function (base) {
    const c = cv(128, 128), x = c.getContext('2d'); x.fillStyle = base || '#8d8f91'; x.fillRect(0, 0, 128, 128);
    grain(x, 128, 128, 40, 9); return c;
  };
  T.ceiling = function (light) {
    const c = cv(128, 128), x = c.getContext('2d'); x.fillStyle = '#e6e3d6'; x.fillRect(0, 0, 128, 128);
    const r = rng(light ? 31 : 32);
    for (let k = 0; k < 300; k++) { x.fillStyle = 'rgba(90,90,80,' + (0.15 + r() * 0.3) + ')'; x.fillRect(r() * 128, r() * 128, 1, 1); }
    x.strokeStyle = '#a9a596'; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128); x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke();
    if (light) {
      x.fillStyle = '#b8b8b0'; x.fillRect(14, 30, 100, 68);
      const g = x.createLinearGradient(0, 34, 0, 94); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fffde8'); g.addColorStop(1, '#ffffff');
      x.fillStyle = g; x.fillRect(18, 34, 92, 60); x.strokeStyle = 'rgba(180,180,170,0.8)'; x.lineWidth = 1;
      for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(18 + i * 15.3, 34); x.lineTo(18 + i * 15.3, 94); x.stroke(); }
    }
    grain(x, 128, 128, 10, 2); return c;
  };
  T.wallHall = function () {
    const c = cv(128, 128), x = c.getContext('2d');
    x.fillStyle = '#e8ddbf'; x.fillRect(0, 0, 128, 80);
    x.strokeStyle = 'rgba(150,130,90,0.35)'; x.lineWidth = 1;
    for (let row = 0; row < 5; row++) { const y = row * 16; x.beginPath(); x.moveTo(0, y + 0.5); x.lineTo(128, y + 0.5); x.stroke(); const off = row % 2 ? 16 : 0; for (let k = off; k < 128; k += 32) { x.beginPath(); x.moveTo(k + 0.5, y); x.lineTo(k + 0.5, y + 16); x.stroke(); } }
    x.fillStyle = '#2c5f73'; x.fillRect(0, 80, 128, 7);
    x.fillStyle = '#4b8f86'; x.fillRect(0, 87, 128, 33);
    x.fillStyle = '#2f2f2f'; x.fillRect(0, 120, 128, 8);
    grain(x, 128, 128, 14, 12); return c;
  };
  T.wallClass = function () {
    const c = cv(128, 128), x = c.getContext('2d');
    x.fillStyle = '#efe5ae'; x.fillRect(0, 0, 128, 76);
    for (let i = 0; i < 128; i += 16) { x.fillStyle = '#e2d692'; x.fillRect(i, 0, 6, 76); }
    x.fillStyle = '#7b5532'; x.fillRect(0, 76, 128, 6);
    x.fillStyle = '#c5b483'; x.fillRect(0, 82, 128, 38);
    x.strokeStyle = 'rgba(110,90,50,0.5)'; for (let i = 0; i < 128; i += 32) { x.strokeRect(i + 4, 87, 24, 28); }
    x.fillStyle = '#4a3420'; x.fillRect(0, 120, 128, 8);
    grain(x, 128, 128, 14, 13); return c;
  };
  T.wallOffice = function () {
    const c = cv(128, 128), x = c.getContext('2d'); const r = rng(41);
    for (let i = 0; i < 8; i++) { const b = 70 + r() * 30; x.fillStyle = 'rgb(' + (b + 40 | 0) + ',' + (b | 0) + ',' + (b - 30 | 0) + ')'; x.fillRect(i * 16, 0, 16, 128); x.fillStyle = 'rgba(20,10,0,0.6)'; x.fillRect(i * 16, 0, 1, 128); }
    x.fillStyle = '#3a2412'; x.fillRect(0, 70, 128, 5); x.fillRect(0, 120, 128, 8);
    grain(x, 128, 128, 12, 14); return c;
  };
  T.wallDet = function () {
    const c = cv(128, 128), x = c.getContext('2d'); x.fillStyle = '#9a9c9e'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#6d6f72'; x.lineWidth = 2;
    for (let row = 0; row < 8; row++) { const y = row * 16; x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke(); const off = row % 2 ? 0 : 32; for (let k = off; k < 128; k += 64) { x.beginPath(); x.moveTo(k, y); x.lineTo(k, y + 16); x.stroke(); } }
    grain(x, 128, 128, 22, 15); return c;
  };
  T.chalkboard = function () {
    const c = cv(256, 128), x = c.getContext('2d');
    x.fillStyle = '#7a4f28'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#244a35'; x.fillRect(8, 8, 240, 106);
    const r = rng(51);
    for (let k = 0; k < 40; k++) { x.fillStyle = 'rgba(255,255,255,' + (r() * 0.06) + ')'; x.fillRect(r() * 240 + 8, r() * 100 + 8, 20 + r() * 40, 6 + r() * 10); }
    x.fillStyle = 'rgba(240,240,230,0.9)'; x.font = 'bold 18px "Comic Sans MS", cursive, sans-serif';
    x.fillText('Spelling + Tech!', 20, 32); x.font = '15px "Comic Sans MS", cursive, sans-serif';
    x.fillText('1 byte = 8 bits', 22, 56); x.fillText('Ctrl+S = save', 22, 76); x.fillText('receive  (i before e...)', 22, 98);
    x.fillText('101 = 5', 170, 56);
    x.fillStyle = '#a07040'; x.fillRect(8, 112, 240, 8); x.fillStyle = '#fff'; x.fillRect(40, 110, 12, 4); x.fillStyle = '#e8d070'; x.fillRect(70, 110, 10, 4);
    return c;
  };
  T.posters = function () {
    const c = cv(256, 256), x = c.getContext('2d');
    const P = [
      { bg: '#e94f37', fg: '#fff', t: ['READ', 'MORE!'], icon: 'book' },
      { bg: '#3f88c5', fg: '#fff', t: ['CTRL+S', 'SAVES LIVES'], icon: 'disk' },
      { bg: '#f6d743', fg: '#222', t: ['NO RUNNING', 'IN THE HALLS', '- Principal Grant'], icon: 'stop' },
      { bg: '#44bba4', fg: '#fff', t: ['THINK', 'BEFORE YOU', 'CLICK!'], icon: 'mouse' }
    ];
    P.forEach(function (p, i) {
      const ox = (i % 2) * 128, oy = ((i / 2) | 0) * 128;
      x.fillStyle = '#fafafa'; x.fillRect(ox, oy, 128, 128);
      x.fillStyle = p.bg; x.fillRect(ox + 6, oy + 6, 116, 116);
      x.fillStyle = p.fg; x.textAlign = 'center';
      x.font = 'bold 15px "Comic Sans MS", cursive, sans-serif';
      p.t.forEach(function (s, k) { x.font = (k === 2 ? '10px ' : 'bold 15px ') + '"Comic Sans MS", cursive, sans-serif'; x.fillText(s, ox + 64, oy + 82 + k * 17); });
      x.fillStyle = p.fg;
      if (p.icon === 'book') { x.fillRect(ox + 40, oy + 22, 22, 40); x.fillRect(ox + 66, oy + 22, 22, 40); x.fillStyle = p.bg; x.fillRect(ox + 62, oy + 22, 4, 40); }
      if (p.icon === 'disk') { x.fillRect(ox + 42, oy + 18, 44, 46); x.fillStyle = p.bg; x.fillRect(ox + 50, oy + 18, 28, 16); x.fillStyle = '#ddd'; x.fillRect(ox + 50, oy + 44, 28, 20); }
      if (p.icon === 'stop') { x.fillStyle = '#c0392b'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; x.lineTo(ox + 64 + Math.cos(a) * 26, oy + 42 + Math.sin(a) * 26); } x.fill(); x.fillStyle = '#fff'; x.font = 'bold 12px sans-serif'; x.fillText('STOP', ox + 64, oy + 47); }
      if (p.icon === 'mouse') { ell(x, ox + 64, oy + 42, 16, 24); x.fill(); x.fillStyle = p.bg; x.fillRect(ox + 63, oy + 18, 2, 18); }
    });
    x.textAlign = 'left';
    grain(x, 256, 256, 10, 16); return c;
  };
  T.door = function (label, kind) {
    const c = cv(256, 256), x = c.getContext('2d');
    const metal = kind === 'det';
    x.fillStyle = metal ? '#6f7579' : (kind === 'office' ? '#6b3a1f' : '#8b5a2b'); x.fillRect(0, 0, 256, 256);
    const r = rng(label.length * 7 + 3);
    if (!metal) for (let k = 0; k < 70; k++) { x.fillStyle = 'rgba(40,20,5,' + (0.1 + r() * 0.2) + ')'; x.fillRect(r() * 256, 0, 1 + r() * 2, 256); }
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 4; x.strokeRect(22, 20, 212, 222);
    x.strokeRect(40, 150, 176, 76);
    // window
    x.fillStyle = '#333'; x.fillRect(86, 30, 84, 70); x.fillStyle = metal ? '#7f8c94' : '#a9d3e8'; x.fillRect(90, 34, 76, 62);
    if (metal) { x.strokeStyle = '#333'; x.lineWidth = 3; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(98 + i * 15, 34); x.lineTo(98 + i * 15, 96); x.stroke(); } }
    else { x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.moveTo(96, 90); x.lineTo(120, 38); x.lineTo(130, 38); x.lineTo(106, 90); x.fill(); }
    // label plate
    x.fillStyle = metal ? '#b71c1c' : '#f3e9c6'; x.fillRect(58, 108, 140, 30); x.strokeStyle = '#2a1a0a'; x.lineWidth = 2; x.strokeRect(58, 108, 140, 30);
    x.fillStyle = metal ? '#fff' : '#2a1a0a'; x.textAlign = 'center'; x.font = 'bold ' + (label.length > 10 ? 13 : 18) + 'px "Comic Sans MS", cursive, sans-serif'; x.fillText(label, 128, 129); x.textAlign = 'left';
    // knob
    x.fillStyle = '#d8b84a'; ell(x, 208, 160, 9, 9); x.fill(); x.fillStyle = '#8a6d1a'; ell(x, 210, 162, 4, 4); x.fill();
    grain(x, 256, 256, 14, 17); return c;
  };
  T.exitDoor = function (state) { // 'closed' | 'open' | 'used'
    const c = cv(128, 128), x = c.getContext('2d');
    if (state === 'open') {
      const g = x.createRadialGradient(64, 70, 5, 64, 70, 90); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#d8ffe0'); g.addColorStop(1, '#5fd37a');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#0b7a2a'; x.fillRect(30, 8, 68, 20); x.fillStyle = '#fff'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.fillText('EXIT >', 64, 23);
      return c;
    }
    x.fillStyle = state === 'used' ? '#3a0d0d' : '#8a9096'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = state === 'used' ? '#5a1111' : '#a3aab0'; x.fillRect(10, 32, 52, 92); x.fillRect(66, 32, 52, 92);
    x.fillStyle = '#555'; x.fillRect(16, 72, 40, 6); x.fillRect(72, 72, 40, 6);
    x.fillStyle = '#c62828'; x.fillRect(30, 6, 68, 20); x.fillStyle = '#fff'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.fillText(state === 'used' ? 'CLOSED' : 'EXIT', 64, 21);
    if (state === 'used') { x.strokeStyle = '#999'; x.lineWidth = 5; x.beginPath(); x.moveTo(10, 40); x.lineTo(118, 110); x.moveTo(118, 40); x.lineTo(10, 110); x.stroke(); }
    grain(x, 128, 128, 14, 18); return c;
  };

  // ---------- pickups ----------
  T.ipad = function (color) {
    const c = cv(64, 64), x = c.getContext('2d');
    x.save(); x.translate(32, 32); x.rotate(-0.12);
    x.fillStyle = 'rgba(0,0,0,0.25)'; rr(x, -17, -21, 38, 48, 6); x.fill();
    x.fillStyle = color; rr(x, -19, -24, 38, 48, 6); x.fill();
    x.fillStyle = '#111'; rr(x, -15, -20, 30, 38, 2); x.fill();
    const g = x.createLinearGradient(-15, -20, 15, 18); g.addColorStop(0, '#5ac8fa'); g.addColorStop(1, '#a259ff');
    x.fillStyle = g; x.fillRect(-14, -19, 28, 36);
    x.fillStyle = '#fff'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { x.globalAlpha = 0.85; rr(x, -11 + i * 8, -15 + j * 9, 6, 6, 1.5); x.fill(); }
    x.globalAlpha = 1; x.fillStyle = '#333'; ell(x, 0, 21, 2.2, 2.2); x.fill();
    x.restore(); return c;
  };
  T.item = function (kind) {
    const c = cv(64, 64), x = c.getContext('2d');
    if (kind === 'drink') {
      x.fillStyle = '#1565c0'; rr(x, 18, 8, 28, 50, 6); x.fill(); x.fillStyle = '#bbb'; x.fillRect(20, 6, 24, 5);
      x.fillStyle = '#ffeb3b'; x.beginPath(); x.moveTo(34, 16); x.lineTo(24, 34); x.lineTo(32, 34); x.lineTo(28, 50); x.lineTo(41, 29); x.lineTo(33, 29); x.lineTo(38, 16); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 9px sans-serif'; x.fillText('ZAP', 23, 57);
    } else if (kind === 'bell') {
      x.fillStyle = '#5d4037'; x.fillRect(29, 4, 6, 12);
      x.fillStyle = '#f9c80e'; x.beginPath(); x.moveTo(14, 48); x.quadraticCurveTo(16, 14, 32, 14); x.quadraticCurveTo(48, 14, 50, 48); x.closePath(); x.fill();
      x.fillStyle = '#e0a800'; x.fillRect(10, 46, 44, 6); x.fillStyle = '#795548'; ell(x, 32, 56, 5, 5); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(22, 22, 4, 20);
    } else if (kind === 'pass') {
      x.save(); x.translate(32, 32); x.rotate(0.15);
      x.fillStyle = '#fff59d'; x.fillRect(-26, -16, 52, 32); x.strokeStyle = '#c0a000'; x.lineWidth = 2; x.strokeRect(-26, -16, 52, 32);
      x.fillStyle = '#333'; x.font = 'bold 10px sans-serif'; x.textAlign = 'center'; x.fillText('HALL', 0, -2); x.fillText('PASS', 0, 10); x.restore();
    }
    return c;
  };

  // ---------- characters ----------
  function ruler(x, cx, cy, ang, len) {
    x.save(); x.translate(cx, cy); x.rotate(ang);
    x.fillStyle = '#f2c94c'; x.fillRect(-4, -len, 9, len); x.strokeStyle = '#8a6d1a'; x.lineWidth = 1; x.strokeRect(-4, -len, 9, len);
    x.fillStyle = '#5a4510'; for (let i = 4; i < len; i += 6) x.fillRect(-4, -i, i % 12 === 4 ? 5 : 3, 1);
    x.restore();
  }
  function arm(x, x1, y1, x2, y2, sleeve, skin, w) {
    x.strokeStyle = sleeve; x.lineWidth = w || 11; x.lineCap = 'round'; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    x.fillStyle = skin; ell(x, x2, y2, 6, 6); x.fill();
  }
  // variant: idle | up | down ; angry boolean
  T.luke = function (variant, angry) {
    const c = cv(128, 256), x = c.getContext('2d');
    const skin = '#e6b28f', hair = '#4a2f1b';
    // ruler behind for idle
    // legs
    x.fillStyle = '#2b1d14'; rr(x, 38, 240, 25, 12, 4); x.fill(); rr(x, 65, 240, 25, 12, 4); x.fill();
    x.fillStyle = '#7f8a99'; x.fillRect(42, 164, 20, 78); x.fillRect(66, 164, 20, 78); // grey slacks
    x.fillStyle = '#6a7482'; x.fillRect(62, 168, 4, 62);
    x.fillStyle = '#222'; x.fillRect(40, 158, 48, 8); x.fillStyle = '#c9a43a'; x.fillRect(60, 159, 8, 6);
    // torso: white shirt + mustard cardigan
    x.fillStyle = '#f4f4ef'; rr(x, 36, 82, 56, 80, 12); x.fill();
    x.fillStyle = '#c48a1d'; x.beginPath(); x.moveTo(36, 96); x.lineTo(54, 86); x.lineTo(62, 160); x.lineTo(36, 160); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(92, 96); x.lineTo(74, 86); x.lineTo(66, 160); x.lineTo(92, 160); x.closePath(); x.fill();
    x.fillStyle = '#8f6312'; for (let i = 0; i < 4; i++) { ell(x, 60, 112 + i * 13, 2, 2); x.fill(); }
    // bow tie
    x.fillStyle = '#b3123a'; x.beginPath(); x.moveTo(64, 88); x.lineTo(54, 82); x.lineTo(54, 94); x.closePath(); x.fill(); x.beginPath(); x.moveTo(64, 88); x.lineTo(74, 82); x.lineTo(74, 94); x.closePath(); x.fill(); x.fillRect(61, 85, 6, 6);
    // pocket protector w/ pens (tech teacher)
    x.fillStyle = '#ddd'; x.fillRect(74, 104, 12, 14); x.fillStyle = '#1e88e5'; x.fillRect(76, 98, 2, 10); x.fillStyle = '#e53935'; x.fillRect(80, 99, 2, 9);
    // arms
    arm(x, 40, 94, 28, 150, '#c48a1d', skin);
    if (variant === 'up') { arm(x, 88, 94, 104, 48, '#c48a1d', skin); ruler(x, 104, 52, 0.25, 70); }
    else if (variant === 'down') { arm(x, 88, 94, 70, 140, '#c48a1d', skin); ruler(x, 72, 140, -1.35, 70); x.fillStyle = skin; ell(x, 28, 150, 7, 7); x.fill(); }
    else { arm(x, 88, 94, 100, 150, '#c48a1d', skin); ruler(x, 100, 150, 0.12, 64); }
    // neck & head
    x.fillStyle = skin; x.fillRect(57, 70, 14, 16);
    ell(x, 41, 50, 5, 8); x.fill(); ell(x, 87, 50, 5, 8); x.fill();
    ell(x, 64, 46, 23, 27); x.fill();
    // hair: swoopy side part, original
    x.fillStyle = hair; x.beginPath(); x.ellipse(64, 30, 25, 15, 0, Math.PI, 0); x.fill();
    x.beginPath(); x.moveTo(40, 32); x.quadraticCurveTo(52, 14, 78, 22); x.quadraticCurveTo(90, 26, 89, 40); x.lineTo(84, 30); x.quadraticCurveTo(66, 26, 46, 36); x.closePath(); x.fill();
    x.fillRect(40, 30, 5, 18); x.fillRect(84, 30, 5, 16);
    // goatee
    x.beginPath(); x.moveTo(54, 64); x.quadraticCurveTo(64, 80, 74, 64); x.quadraticCurveTo(64, 70, 54, 64); x.fill();
    // glasses (square, thick)
    x.strokeStyle = '#111'; x.lineWidth = 3; x.fillStyle = 'rgba(200,230,255,0.35)';
    rr(x, 45, 38, 16, 12, 3); x.fill(); x.stroke(); rr(x, 67, 38, 16, 12, 3); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(61, 43); x.lineTo(67, 43); x.moveTo(45, 42); x.lineTo(41, 41); x.moveTo(83, 42); x.lineTo(87, 41); x.stroke();
    // eyes
    x.fillStyle = '#111'; ell(x, 53, 44, 2.6, angry ? 2 : 3); x.fill(); ell(x, 75, 44, 2.6, angry ? 2 : 3); x.fill();
    // brows
    x.strokeStyle = hair; x.lineWidth = 3.5; x.beginPath();
    if (angry) { x.moveTo(45, 31); x.lineTo(60, 37); x.moveTo(83, 31); x.lineTo(68, 37); } else { x.moveTo(46, 33); x.lineTo(59, 32); x.moveTo(69, 32); x.lineTo(82, 33); }
    x.stroke();
    // nose
    x.strokeStyle = '#b07a5a'; x.lineWidth = 2; x.beginPath(); x.moveTo(64, 46); x.lineTo(61, 55); x.lineTo(66, 56); x.stroke();
    // mouth
    x.lineWidth = 2.5; x.strokeStyle = '#5a1a1a'; x.beginPath();
    if (angry) { x.fillStyle = '#5a1a1a'; x.moveTo(55, 66); x.quadraticCurveTo(64, 58, 73, 66); x.lineTo(55, 66); x.fill(); x.fillStyle = '#fff'; x.fillRect(58, 62, 12, 2); }
    else { x.moveTo(55, 60); x.quadraticCurveTo(64, 67, 73, 60); x.stroke(); }
    return c;
  };
  T.grant = function (frame) {
    const c = cv(128, 256), x = c.getContext('2d'); const skin = '#d9a07a';
    const l = frame ? 3 : -3;
    x.fillStyle = '#111'; rr(x, 38 + l, 242, 24, 12, 4); x.fill(); rr(x, 66 - l, 242, 24, 12, 4); x.fill();
    x.fillStyle = '#1d2540'; x.fillRect(42 + l, 160, 20, 84); x.fillRect(66 - l, 160, 20, 84);
    x.fillStyle = '#242e52'; rr(x, 32, 78, 64, 92, 12); x.fill();
    x.fillStyle = '#f0f0f0'; x.beginPath(); x.moveTo(54, 80); x.lineTo(64, 112); x.lineTo(74, 80); x.fill();
    x.fillStyle = '#2e7d32'; x.beginPath(); x.moveTo(61, 84); x.lineTo(67, 84); x.lineTo(68, 118); x.lineTo(64, 124); x.lineTo(60, 118); x.fill();
    x.strokeStyle = '#ccc'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(52, 82); x.quadraticCurveTo(64, 120, 76, 82); x.stroke();
    x.fillStyle = '#cfd8dc'; rr(x, 58, 116, 14, 7, 3); x.fill();
    // badge
    x.fillStyle = '#ffd54f'; x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? 4 : 8; x.lineTo(84 + Math.cos(a) * rad, 100 + Math.sin(a) * rad); } x.fill();
    arm(x, 36, 90, 26, 148, '#242e52', skin, 12);
    arm(x, 92, 90, 98, 140, '#242e52', skin, 12);
    x.fillStyle = '#8d6e63'; x.fillRect(90, 118, 26, 34); x.fillStyle = '#fff'; x.fillRect(93, 124, 20, 26); x.fillStyle = '#9e9e9e'; x.fillRect(98, 115, 10, 6);
    x.fillStyle = '#555'; for (let i = 0; i < 5; i++) x.fillRect(95, 129 + i * 4, 16, 1);
    x.fillStyle = skin; x.fillRect(56, 66, 16, 16); ell(x, 64, 42, 22, 28); x.fill(); ell(x, 42, 44, 4, 7); x.fill(); ell(x, 86, 44, 4, 7); x.fill();
    x.fillStyle = '#bdbdbd'; x.fillRect(40, 18, 48, 10); x.fillRect(40, 18, 6, 26); x.fillRect(82, 18, 6, 26); x.beginPath(); x.ellipse(64, 22, 24, 10, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#9e9e9e'; x.beginPath(); x.moveTo(46, 58); x.quadraticCurveTo(64, 48, 82, 58); x.quadraticCurveTo(74, 64, 64, 58); x.quadraticCurveTo(54, 64, 46, 58); x.fill();
    x.fillStyle = '#111'; x.fillRect(48, 39, 10, 3); x.fillRect(70, 39, 10, 3);
    x.strokeStyle = '#757575'; x.lineWidth = 3; x.beginPath(); x.moveTo(46, 33); x.lineTo(59, 36); x.moveTo(82, 33); x.lineTo(69, 36); x.stroke();
    x.strokeStyle = '#6d3b2a'; x.lineWidth = 2; x.beginPath(); x.moveTo(57, 66); x.lineTo(71, 66); x.stroke();
    return c;
  };
  T.skippy = function (phase, jumping) { // phase 0..3 rope position
    const c = cv(128, 256), x = c.getContext('2d'); const skin = '#c68a5e';
    const oy = jumping ? -14 : 0;
    const hands = [[28, 150 + oy], [100, 150 + oy]];
    function rope(front) {
      x.strokeStyle = '#e91e63'; x.lineWidth = 3; x.beginPath(); x.moveTo(hands[0][0], hands[0][1]);
      const cy = [40, 150, 256, 150][phase]; x.quadraticCurveTo(64, cy + (phase === 2 ? 0 : oy), hands[1][0], hands[1][1]);
      if ((phase === 1 || phase === 2) === front) x.stroke();
    }
    rope(false);
    x.fillStyle = '#fff'; rr(x, 40, 236 + oy, 22, 12, 5); x.fill(); rr(x, 66, 236 + oy, 22, 12, 5); x.fill();
    x.fillStyle = '#e53935'; x.fillRect(40, 244 + oy, 22, 4); x.fillRect(66, 244 + oy, 22, 4);
    x.fillStyle = skin; x.fillRect(46, 190 + oy, 12, 48); x.fillRect(70, 190 + oy, 12, 48);
    x.fillStyle = '#1e88e5'; rr(x, 40, 168 + oy, 48, 30, 6); x.fill();
    for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#ffeb3b' : '#43a047'; x.fillRect(38, 112 + oy + i * 12, 52, 12); }
    arm(x, 40, 118 + oy, 28, 150 + oy, '#43a047', skin, 10);
    arm(x, 88, 118 + oy, 100, 150 + oy, '#43a047', skin, 10);
    x.fillStyle = '#ffccbc'; x.fillStyle = '#795548'; x.fillRect(26, 146 + oy, 5, 10); x.fillRect(98, 146 + oy, 5, 10);
    x.fillStyle = skin; x.fillRect(57, 98 + oy, 14, 16); ell(x, 64, 70 + oy, 30, 32); x.fill();
    x.fillStyle = '#3e2723'; x.beginPath(); x.ellipse(64, 56 + oy, 30, 18, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#fb8c00'; x.beginPath(); x.ellipse(64, 48 + oy, 31, 15, 0, Math.PI, 0); x.fill(); x.fillRect(28, 44 + oy, 20, 7);
    x.fillStyle = '#fff'; ell(x, 52, 72 + oy, 7, 8); x.fill(); ell(x, 76, 72 + oy, 7, 8); x.fill();
    x.fillStyle = '#222'; ell(x, 53, 73 + oy, 3.5, 4); x.fill(); ell(x, 77, 73 + oy, 3.5, 4); x.fill();
    x.fillStyle = '#8d5a3b'; for (let i = 0; i < 6; i++) { ell(x, 44 + (i % 3) * 5, 84 + oy + (i > 2 ? 3 : 0), 1.2, 1.2); x.fill(); ell(x, 76 + (i % 3) * 5, 84 + oy + (i > 2 ? 3 : 0), 1.2, 1.2); x.fill(); }
    x.fillStyle = '#5a1a1a'; x.beginPath(); x.moveTo(52, 88 + oy); x.quadraticCurveTo(64, 102 + oy, 76, 88 + oy); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.fillRect(58, 88 + oy, 5, 4);
    rope(true);
    return c;
  };
  T.broom = function (frame) {
    const c = cv(128, 128), x = c.getContext('2d');
    x.fillStyle = '#333'; ell(x, 30, 112, 12, 12); x.fill(); ell(x, 98, 112, 12, 12); x.fill();
    x.fillStyle = '#f9a825'; rr(x, 16, 40, 96, 66, 10); x.fill();
    for (let i = 0; i < 7; i++) { x.fillStyle = i % 2 ? '#222' : '#f9a825'; x.beginPath(); x.moveTo(16 + i * 14, 92); x.lineTo(30 + i * 14, 92); x.lineTo(22 + i * 14, 104); x.lineTo(8 + i * 14, 104); x.fill(); }
    x.fillStyle = '#90a4ae'; x.beginPath(); x.ellipse(64, 40, 34, 24, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#b71c1c'; rr(x, 38, 24, 52, 12, 6); x.fill(); x.fillStyle = frame ? '#ff5252' : '#ff8a80'; ell(x, frame ? 52 : 76, 30, 7, 4); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center'; x.fillText('CLEAN', 64, 72);
    x.strokeStyle = '#6d4c41'; x.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const bx = 14 + i * 5.6 + (frame ? 2.5 : 0); x.beginPath(); x.moveTo(bx, 104); x.lineTo(bx + (frame ? 4 : -4), 126); x.stroke(); }
    x.fillStyle = '#8d6e63'; x.fillRect(10, 100, 108, 6);
    return c;
  };
  T.byte = function (frame) {
    const c = cv(128, 128), x = c.getContext('2d');
    x.strokeStyle = '#78909c'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 22); x.lineTo(64, 6); x.stroke();
    x.fillStyle = frame ? '#76ff03' : '#33691e'; ell(x, 64, 6, 6, 6); x.fill();
    x.fillStyle = '#eceff1'; rr(x, 30, 20, 68, 52, 16); x.fill(); x.strokeStyle = '#90a4ae'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#0d47a1'; rr(x, 38, 28, 52, 36, 8); x.fill();
    x.strokeStyle = '#4fc3f7'; x.lineWidth = 3; x.beginPath(); x.moveTo(48, 46); x.lineTo(54, 40); x.lineTo(60, 46); x.moveTo(68, 46); x.lineTo(74, 40); x.lineTo(80, 46); x.stroke();
    x.beginPath(); x.arc(64, 50, 8, 0.2, Math.PI - 0.2); x.stroke();
    x.fillStyle = '#eceff1'; rr(x, 36, 74, 56, 34, 12); x.fill(); x.strokeStyle = '#90a4ae'; x.stroke();
    x.fillStyle = '#ff7043'; ell(x, 64, 90, 6, 6); x.fill();
    x.strokeStyle = '#b0bec5'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(36, 84); x.lineTo(frame ? 18 : 22, frame ? 64 : 96); x.moveTo(92, 84); x.lineTo(106, 96); x.stroke();
    x.fillStyle = '#455a64'; ell(x, 64, 116, 16, 9); x.fill();
    return c;
  };
})();
