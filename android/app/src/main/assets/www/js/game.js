/* Mr. Luke's Teachings in Spelling and Technology - main game */
(function () {
  'use strict';
  const LG = window.LG; const T = LG.tex, AU = LG.audio, VO = LG.voice;
  const S = LG.S, WH = LG.WH;
  const $ = function (id) { return document.getElementById(id); };
  window.addEventListener('error', function (e) { const el = $('err'); if (el) { el.classList.remove('hidden'); el.textContent = 'Error: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno; } });
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // ---------- settings ----------
  const settings = { sens: 1, vol: 0.8, quality: 'med', minimap: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('luke_settings') || '{}')); } catch (e) { }
  function saveSettings() { try { localStorage.setItem('luke_settings', JSON.stringify(settings)); } catch (e) { } }

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  $('game').appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const FOG_BASE = new THREE.Color(0xcfc6aa), FOG_RED = new THREE.Color(0x4a0606);
  scene.background = FOG_BASE.clone(); scene.fog = new THREE.Fog(FOG_BASE.clone(), 5, 44);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 70); camera.rotation.order = 'YXZ';
  function applyQuality() {
    const q = { low: 0.55, med: 1, high: Math.min(window.devicePixelRatio || 1, 2) }[settings.quality] || 1;
    renderer.setPixelRatio(q); renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }
  applyQuality(); window.addEventListener('resize', applyQuality);

  const world = LG.buildWorld(scene); const L = world.layout; const G = L.grid;
  const cellOf = function (v) { return Math.floor(v / S); };
  function ch(cx, cy) { if (cy < 0 || cx < 0 || cy >= L.H || cx >= L.W) return '#'; return G[cy][cx]; }
  const hallCells = [], walkCells = [];
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) { const c = G[y][x]; if (c === '.') hallCells.push([x, y]); if (c !== '#' && c !== 'E') walkCells.push([x, y]); }

  // ---------- collision / LOS / paths ----------
  function solid(cx, cy, isPlayer) {
    const c = ch(cx, cy); if (c === '#' || c === 'E') return true;
    if (c === 'D' && isPlayer) { const d = world.doorAt[cy * L.W + cx]; if (d && d.locked) return true; }
    return false;
  }
  function collide(o, r, isPlayer) {
    const cx = cellOf(o.x), cz = cellOf(o.z);
    for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (!solid(i, j, isPlayer)) continue;
      const minx = i * S, maxx = minx + S, minz = j * S, maxz = minz + S;
      const px = Math.max(minx, Math.min(o.x, maxx)), pz = Math.max(minz, Math.min(o.z, maxz));
      const dx = o.x - px, dz = o.z - pz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x += dx / d * (r - d); o.z += dz / d * (r - d); }
        else { const l = o.x - minx, rg = maxx - o.x, t = o.z - minz, b = maxz - o.z, m = Math.min(l, rg, t, b); if (m === l) o.x = minx - r; else if (m === rg) o.x = maxx + r; else if (m === t) o.z = minz - r; else o.z = maxz + r; }
      }
    }
  }
  function moveC(o, dx, dz, r, isPlayer) { const dist = Math.hypot(dx, dz); const n = Math.max(1, Math.ceil(dist / (r * 0.5))); for (let s = 0; s < n; s++) { o.x += dx / n; o.z += dz / n; collide(o, r, isPlayer); } }
  function los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz), n = Math.ceil(dist / 0.8);
    for (let i = 1; i < n; i++) {
      const x = ax + dx * i / n, z = az + dz * i / n, cx = cellOf(x), cz = cellOf(z), c = ch(cx, cz);
      if (c === '#' || c === 'E') return false;
      if (c === 'D') { const d = world.doorAt[cz * L.W + cx]; if (d && d.open < 0.5) return false; }
    }
    return true;
  }
  const npcPass = function (x, y) { const c = G[y][x]; return c !== '#' && c !== 'E'; };
  function bfs(sx, sy, tx, ty, pass) {
    const W = L.W, H = L.H; if (sx === tx && sy === ty) return [];
    const prev = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let qh = 0, qt = 0;
    const s = sy * W + sx, t = ty * W + tx; prev[s] = s; q[qt++] = s;
    while (qh < qt) { const c = q[qh++]; if (c === t) break; const cx = c % W, cy = (c / W) | 0;
      for (const d of LG.DIRS) { const nx = cx + d[0], ny = cy + d[1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (prev[n] !== -1 || !pass(nx, ny)) continue; prev[n] = c; q[qt++] = n; } }
    if (prev[t] === -1) return null; const path = []; let c = t; while (c !== s) { path.push([c % W, (c / W) | 0]); c = prev[c]; } return path.reverse();
  }
  function followPath(n, dist) {
    while (dist > 0 && n.path && n.path.length) {
      const tx = (n.path[0][0] + 0.5) * S, tz = (n.path[0][1] + 0.5) * S, dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d <= dist) { n.x = tx; n.z = tz; dist -= d; n.path.shift(); } else { n.x += dx / d * dist; n.z += dz / d * dist; dist = 0; }
      n.moving = true;
    }
    return dist;
  }
  function wander(n, dt, speed, targets) {
    n.moving = false;
    if (!n.path || !n.path.length) { n.wait -= dt; if (n.wait > 0) return; const t = targets[(Math.random() * targets.length) | 0]; n.path = bfs(cellOf(n.x), cellOf(n.z), t[0], t[1], npcPass) || []; n.wait = 0.4 + Math.random() * 1.6; }
    followPath(n, speed * dt);
  }
  function chaseTo(n, dt, dist, tx, tz, r) {
    if (los(n.x, n.z, tx, tz)) { const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz); if (d > 0.05) { const s = Math.min(dist, d); moveC(n, dx / d * s, dz / d * s, r, false); } n.path = []; n.moving = true; return; }
    n.repath = (n.repath || 0) - dt;
    if (!n.path || !n.path.length || n.repath <= 0) { n.path = bfs(cellOf(n.x), cellOf(n.z), cellOf(tx), cellOf(tz), npcPass) || []; n.repath = 0.35; }
    followPath(n, dist);
  }

  // ---------- sprites ----------
  function bb(canvasEl, w, h) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: T.toTex(canvasEl, { sprite: true }), alphaTest: 0.5 }));
    m.userData.h = h; scene.add(m); world.mats.push(m.material); return m;
  }
  function ttx(c) { return T.toTex(c, { sprite: true }); }
  const TX = {
    lukeIdle: ttx(T.luke('idle', false)), lukeAngry: ttx(T.luke('idle', true)), lukeUp: ttx(T.luke('up', true)), lukeDown: ttx(T.luke('down', true)),
    grant: [ttx(T.grant(0)), ttx(T.grant(1))], skippy: [0, 1, 2, 3].map(function (p) { return ttx(T.skippy(p, p === 2)); }),
    broom: [ttx(T.broom(0)), ttx(T.broom(1))], byte: [ttx(T.byte(0)), ttx(T.byte(1))]
  };
  const IPAD_COLORS = ['#e0e0e0', '#ff7043', '#42a5f5', '#66bb6a', '#ab47bc', '#ffca28', '#ec407a'];
  const ITEM_CANVAS = { drink: T.item('drink'), bell: T.item('bell'), pass: T.item('pass') };
  const ITEM_NAMES = { drink: 'ZAP Energy Drink', bell: 'Quiet Bell', pass: 'Hall Pass' };
  const ITEM_URL = {}; for (const k in ITEM_CANVAS) ITEM_URL[k] = ITEM_CANVAS[k].toDataURL();
  const ipadTex = IPAD_COLORS.map(function (c) { return ttx(T.ipad(c)); });
  const itemTex = { drink: ttx(ITEM_CANVAS.drink), bell: ttx(ITEM_CANVAS.bell), pass: ttx(ITEM_CANVAS.pass) };
  function setMap(mesh, tex) { if (mesh.material.map !== tex) mesh.material.map = tex; }

  // ---------- state ----------
  const game = { state: 'title', time: 0 };
  const player = { x: 0, z: 0, yaw: 0, pitch: 0, stamina: 100, running: false, pushX: 0, pushZ: 0, pushT: 0, stepAcc: 0, bob: 0 };
  const cellCenter = function (c) { return { x: (c[0] + 0.5) * S, z: (c[1] + 0.5) * S }; };
  function mkNPC(tex, w, h, start) { const p = cellCenter(start); return { x: p.x, z: p.z, mesh: bb(tex.image, w, h), path: [], wait: 0, moving: false, frameT: 0, frame: 0 }; }
  const luke = mkNPC(TX.lukeIdle, 1.4, 2.8, [L.lukeStart.x, L.lukeStart.y]);
  const grant = mkNPC(TX.grant[0], 1.45, 2.9, [30, 27]);
  const skippy = mkNPC(TX.skippy[0], 1.0, 2.0, [1, 22]);
  const broom = mkNPC(TX.broom[0], 1.7, 1.7, [24, 5]);
  const byte = mkNPC(TX.byte[0], 1.2, 1.2, [6, 9]);
  const npcs = [luke, grant, skippy, broom, byte];
  let pickups = [];
  const inv = [null, null, null]; let sel = 0;

  function clearPickups() { pickups.forEach(function (p) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }); pickups = []; }
  function addPickup(type, x, z, idx) {
    const tex = type === 'ipad' ? ipadTex[idx % ipadTex.length] : itemTex[type];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(type === 'ipad' ? 0.95 : 0.8, type === 'ipad' ? 0.95 : 0.8), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 }));
    if (game.tint) m.material.color.copy(game.tint);
    scene.add(m); const p = { type: type, x: x, z: z, mesh: m, alive: true, phase: Math.random() * 6 }; pickups.push(p); return p;
  }
  function roomCells(r, avoidDoor) {
    const out = []; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { if (avoidDoor && Math.abs(x - r.door.x) + Math.abs(y - r.door.y) <= 1) continue; out.push([x, y]); } return out;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function newGame() {
    clearPickups();
    const ps = cellCenter([L.playerStart.x, L.playerStart.y]); Object.assign(player, { x: ps.x, z: ps.z, yaw: -Math.PI / 2, pitch: 0, stamina: 100, running: false, pushX: 0, pushZ: 0, pushT: 0 });
    Object.assign(game, { time: 0, anger: 0, collected: 0, escape: false, exitsHit: 0, det: 0, passT: 0, drinkT: 0, bell: null, rope: null, tint: null, runToggle: false, firstWrong: false, quiz: null });
    inv[0] = inv[1] = inv[2] = null; sel = 0;
    const lp = cellCenter([L.lukeStart.x, L.lukeStart.y]); Object.assign(luke, { x: lp.x, z: lp.z, path: [], budget: 0, pulseT: 1.2, slapT: 0 });
    Object.assign(grant, cellCenter([30, 27]), { path: [], state: 'wander', cool: 4, pursueT: 0 });
    Object.assign(skippy, cellCenter([1, 22]), { path: [], cool: 6 });
    const bs = [24, 5]; Object.assign(broom, cellCenter(bs), { cx: bs[0], cy: bs[1], tx: bs[0], ty: bs[1], dx: 0, dy: 1, pause: 1, pushCool: 0, whirT: 0 });
    Object.assign(byte, cellCenter([6, 9]), { path: [], given: false, beepT: 5 });
    world.doors.forEach(function (d) { d.locked = false; d.open = 0; });
    world.exits.forEach(function (e) { world.setExitState(e, 'closed'); });
    world.setTint(new THREE.Color(1, 1, 1)); scene.background.copy(FOG_BASE); scene.fog.color.copy(FOG_BASE); $('vignette').classList.remove('red');
    // 7 iPads in 7 different classrooms
    const classes = shuffle(L.rooms.filter(function (r) { return r.type === 'class'; }));
    for (let i = 0; i < 7; i++) { const cells = roomCells(classes[i], true); const c = cells[(Math.random() * cells.length) | 0]; const p = cellCenter(c); addPickup('ipad', p.x, p.z, i); }
    // items: 2 drinks, 1 bell, 1 pass in remaining rooms / halls
    const spots = shuffle(classes.slice(7).map(function (r) { return roomCells(r, true)[0]; }).concat(shuffle(hallCells.slice()).slice(0, 6)));
    ['drink', 'drink', 'bell', 'pass'].forEach(function (t, i) { const p = cellCenter(spots[i]); addPickup(t, p.x + (Math.random() - 0.5), p.z + (Math.random() - 0.5), 0); });
    AU.droneStop(); updateHUD(true); drawMinimapStatic();
  }

  // ---------- UI helpers ----------
  const ui = LG.ui = {};
  ui.sub = function (text, color, dur) {
    const box = $('subs'); const el = document.createElement('div'); el.className = 'sub'; el.textContent = text; if (color) el.style.color = color; box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 500); }, (dur || 3) * 1000);
  };
  function show(id) { $(id).classList.remove('hidden'); } function hide(id) { $(id).classList.add('hidden'); }
  const screens = ['title', 'howto', 'settings', 'credits', 'pause', 'over', 'win'];
  function onlyScreen(id) { screens.forEach(function (s) { if (s === id) show(s); else hide(s); }); }
  let lastHUD = {};
  function updateHUD(force) {
    const nb = game.escape ? null : 'iPads: ' + game.collected + '/7';
    if (force || lastHUD.nb !== nb) { if (nb) { $('nbCount').textContent = nb; show('nbCount'); } else hide('nbCount'); lastHUD.nb = nb; }
    const ex = game.escape ? 'Exits: ' + game.exitsHit + '/4' : null;
    if (force || lastHUD.ex !== ex) { if (ex) { $('exitCount').textContent = ex; show('exitCount'); } else hide('exitCount'); lastHUD.ex = ex; }
    const det = game.det > 0 ? 'DETENTION: ' + Math.ceil(game.det) + 's' : null;
    if (force || lastHUD.det !== det) { if (det) { $('detTimer').textContent = det; show('detTimer'); } else hide('detTimer'); lastHUD.det = det; }
    const ps = game.passT > 0 ? 'Hall Pass: ' + Math.ceil(game.passT) + 's' : null;
    if (force || lastHUD.ps !== ps) { if (ps) { $('passTimer').textContent = ps; show('passTimer'); } else hide('passTimer'); lastHUD.ps = ps; }
    const st = Math.round(player.stamina);
    if (force || lastHUD.st !== st || lastHUD.dr !== (game.drinkT > 0)) { $('stamFill').style.width = Math.min(100, st) + '%'; $('stamFill').style.background = game.drinkT > 0 ? 'linear-gradient(90deg,#29b6f6,#e1f5fe)' : ''; lastHUD.st = st; lastHUD.dr = game.drinkT > 0; }
    const invKey = inv.join(',') + sel;
    if (force || lastHUD.inv !== invKey) {
      document.querySelectorAll('.slot').forEach(function (el, i) { el.style.backgroundImage = inv[i] ? 'url(' + ITEM_URL[inv[i]] + ')' : 'none'; el.classList.toggle('sel', i === sel); });
      lastHUD.inv = invKey;
    }
    $('minimap').style.display = settings.minimap ? '' : 'none';
    $('btnRun').classList.toggle('on', !!game.runToggle);
  }

  // ---------- minimap ----------
  const mm = $('minimap'), mmx = mm.getContext('2d'), mmStatic = T.cv(148, 116), MS = 4;
  function drawMinimapStatic() {
    const x = mmStatic.getContext('2d'); x.clearRect(0, 0, 148, 116);
    for (let y = 0; y < L.H; y++) for (let xx = 0; xx < L.W; xx++) {
      const c = G[y][xx]; if (c === '#') continue;
      x.fillStyle = c === 'E' ? '#c62828' : c === 'D' ? '#a1887f' : c === 'r' ? (L.roomMap[y][xx] === L.det.id ? '#555' : L.roomMap[y][xx] === L.office.id ? '#6d4c41' : '#5c6bc0') : '#bdbdbd';
      x.fillRect(xx * MS, y * MS, MS, MS);
    }
  }
  function drawMinimap() {
    if (!settings.minimap) return;
    mmx.clearRect(0, 0, 148, 116); mmx.drawImage(mmStatic, 0, 0);
    const sc = MS / S;
    if (game.escape) world.exits.forEach(function (e) { mmx.fillStyle = e.state === 'open' ? (Math.floor(game.time * 4) % 2 ? '#00e676' : '#b9f6ca') : '#333'; mmx.fillRect(e.x * MS - 1, e.y * MS - 1, MS + 2, MS + 2); });
    pickups.forEach(function (p) { if (!p.alive) return; mmx.fillStyle = p.type === 'ipad' ? '#ffeb3b' : '#80deea'; mmx.fillRect(p.x * sc - 1.5, p.z * sc - 1.5, 3, 3); });
    if (los(player.x, player.z, luke.x, luke.z) || Math.hypot(luke.x - player.x, luke.z - player.z) < 8) { mmx.fillStyle = '#ff1744'; mmx.beginPath(); mmx.arc(luke.x * sc, luke.z * sc, 2.5, 0, 7); mmx.fill(); }
    mmx.save(); mmx.translate(player.x * sc, player.z * sc); mmx.rotate(-player.yaw); mmx.fillStyle = '#00e5ff'; mmx.beginPath(); mmx.moveTo(0, -4.5); mmx.lineTo(3, 3); mmx.lineTo(-3, 3); mmx.closePath(); mmx.fill(); mmx.restore();
  }

  // ---------- helpers ----------
  function fwd() { return { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) }; }
  function rightV() { return { x: Math.cos(player.yaw), z: -Math.sin(player.yaw) }; }
  function spatial(x, z, range) { const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz); const r = rightV(); const v = Math.max(0, 1 - d / (range || 40)); return { vol: v * v, pan: d > 0.1 ? (dx * r.x + dz * r.z) / d : 0, d: d }; }
  function inHall() { const c = ch(cellOf(player.x), cellOf(player.z)); return c === '.' || c === 'D'; }
  function distP(n) { return Math.hypot(n.x - player.x, n.z - player.z); }

  // ---------- doors ----------
  function updateDoors(dt) {
    const ents = [player].concat(npcs);
    world.doors.forEach(function (d) {
      let near = false;
      for (const e of ents) { if (d.locked && e === player) continue; if (Math.abs(e.x - d.cx) < 3.6 && Math.abs(e.z - d.cz) < 3.6) { near = true; break; } }
      if (d.locked && Math.hypot(player.x - d.cx, player.z - d.cz) < 4) near = false;
      const target = near ? 1 : 0; const prev = d.open;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 4);
      if (prev === 0 && d.open > 0) { const s = spatial(d.cx, d.cz, 20); AU.door(s.vol, s.pan); }
      d.mesh.position.y = WH / 2 + d.open * (WH - 0.25); d.mesh.visible = d.open < 0.99;
    });
  }

  // ---------- player ----------
  const keys = {}; const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 }; let lookId = null, lookX = 0, lookY = 0;
  function updatePlayer(dt) {
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
    if (joy.id !== null) { f += -joy.y; s += joy.x; }
    let len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; len = 1; }
    if (game.rope) { f = s = 0; len = 0; }
    const wantRun = (keys.ShiftLeft || keys.ShiftRight || game.runToggle) && len > 0.2;
    player.running = wantRun && (player.stamina > 0 || game.drinkT > 0);
    if (player.running && game.drinkT <= 0) { player.stamina -= 22 * dt; if (player.stamina <= 0) { player.stamina = 0; game.runToggle = false; } }
    else if (!player.running) player.stamina = Math.min(100, player.stamina + (len > 0.1 ? 9 : 18) * dt);
    const speed = (player.running ? 9.5 : 5.5) * len;
    const F = fwd(), R = rightV();
    if (len > 0) { const mx = (F.x * f + R.x * s) / (len || 1), mz = (F.z * f + R.z * s) / (len || 1); moveC(player, mx * speed * dt, mz * speed * dt, 0.5, true); }
    if (player.pushT > 0) { player.pushT -= dt; moveC(player, player.pushX * dt, player.pushZ * dt, 0.5, true); player.pushX *= (1 - 2.5 * dt); player.pushZ *= (1 - 2.5 * dt); }
    const moved = speed * dt;
    if (moved > 0) { player.stepAcc += moved; player.bob += moved * 1.6; if (player.stepAcc > (player.running ? 2.6 : 2.0)) { player.stepAcc = 0; AU.step(player.running ? 0.22 : 0.12, 0); } }
    camera.position.set(player.x, 1.7 + Math.sin(player.bob) * 0.05, player.z); camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
    // exits
    if (game.escape) world.exits.forEach(function (e) {
      if (e.state !== 'open') return;
      if (Math.hypot(player.x - e.mesh.position.x, player.z - e.mesh.position.z) < 1.6) reachExit(e);
    });
  }
  function look(dx, dy, k) { player.yaw -= dx * k * settings.sens; player.pitch = Math.max(-1.25, Math.min(1.25, player.pitch - dy * k * settings.sens)); }

  // ---------- Mr. Luke ----------
  function updateLuke(dt) {
    luke.slapT -= dt;
    if (game.anger <= 0) { setMap(luke.mesh, TX.lukeIdle); return; }
    const interval = Math.max(0.5, 1.5 - 0.09 * game.anger), D = Math.min(6.5, 2.2 + 0.33 * game.anger);
    luke.pulseT -= dt;
    if (luke.pulseT <= 0) { luke.pulseT += interval; luke.budget += D; luke.slapT = 0.16; const s = spatial(luke.x, luke.z, 55); AU.slap(Math.max(0.05, s.vol), s.pan); }
    let tx = player.x, tz = player.z;
    if (game.bell) { tx = game.bell.x; tz = game.bell.z; }
    if (luke.budget > 0) { const step = Math.min(luke.budget, 16 * dt); luke.budget -= step; chaseTo(luke, dt, step, tx, tz, 0.45); }
    setMap(luke.mesh, luke.slapT > 0 ? TX.lukeDown : (luke.pulseT < 0.25 ? TX.lukeUp : TX.lukeAngry));
    if (distP(luke) < 1.35) gameOver();
  }

  // ---------- Principal Grant ----------
  function updateGrant(dt) {
    grant.cool -= dt;
    if (grant.state === 'wander') {
      wander(grant, dt, 4, hallCells);
      if (grant.cool <= 0 && game.det <= 0 && game.passT <= 0 && player.running && inHall() && distP(grant) < 30 && los(grant.x, grant.z, player.x, player.z)) {
        grant.state = 'pursue'; grant.pursueT = 12; AU.whistle(); ui.sub('Principal Grant: Hey! NO RUNNING IN THE HALLS!', '#90caf9', 3);
      }
    } else {
      grant.pursueT -= dt; chaseTo(grant, dt, 8.6 * dt, player.x, player.z, 0.45);
      if (game.passT > 0) { grant.state = 'wander'; grant.path = []; ui.sub('Principal Grant: Oh, you have a hall pass. Carry on.', '#90caf9'); }
      else if (distP(grant) < 1.5) sendToDetention();
      else if (grant.pursueT <= 0) { grant.state = 'wander'; grant.path = []; grant.cool = 5; ui.sub('Principal Grant: Hmph. Walk next time.', '#90caf9'); }
    }
    grant.frameT += dt; if (grant.moving && grant.frameT > 0.3) { grant.frameT = 0; grant.frame ^= 1; } setMap(grant.mesh, TX.grant[grant.frame]);
  }
  function sendToDetention() {
    const r = L.det; const door = world.doorAt[r.door.y * L.W + r.door.x];
    player.x = ((r.x0 + r.x1 + 1) / 2) * S; player.z = ((r.y0 + r.y1 + 1) / 2 + 0.5) * S; player.pushT = 0;
    // face the door
    player.yaw = Math.atan2(-(door.cx - player.x), -(door.cz - player.z)); player.pitch = 0;
    game.det = 15; door.locked = true; door.open = 0; game.rope = null; hide('rope'); game.runToggle = false;
    const out = cellCenter([door.outX, door.outY]); grant.x = out.x; grant.z = out.z; grant.path = []; grant.state = 'wander'; grant.cool = 22; grant.wait = 3;
    AU.whistle(); VO.play('detention');
  }
  function updateDetention(dt) {
    if (game.det <= 0) return; game.det -= dt;
    if (game.det <= 0) endDetention('Detention is over. You can go.');
  }
  function endDetention(msg) { game.det = 0; const d = world.doorAt[L.det.door.y * L.W + L.det.door.x]; d.locked = false; ui.sub(msg, '#90caf9'); }

  // ---------- Skippy ----------
  function updateSkippy(dt) {
    skippy.cool -= dt;
    if (!game.rope) {
      wander(skippy, dt, 3.2, hallCells);
      skippy.frameT += dt; if (skippy.frameT > 0.22) { skippy.frameT = 0; skippy.frame = (skippy.frame + 1) % 4; }
      if (skippy.cool <= 0 && game.det <= 0 && distP(skippy) < 1.6) startRope();
    } else {
      const ph = game.rope.phase; skippy.frame = ph < 0.25 ? 0 : ph < 0.4 ? 1 : ph < 0.62 ? 2 : 3;
    }
    setMap(skippy.mesh, TX.skippy[skippy.frame]);
  }
  function startRope() {
    game.rope = { count: 0, phase: 0, cycle: 0, pressed: -1 }; show('rope'); $('ropeCount').textContent = '0/5'; game.runToggle = false; VO.play('skippy');
  }
  function updateRope(dt) {
    const r = game.rope; if (!r) return; r.phase += dt / 1.15; if (r.phase >= 1) { r.phase -= 1; r.cycle++; }
    $('ropeMarker').style.left = 'calc(' + (r.phase * 100).toFixed(1) + '% - 5px)';
  }
  function ropePress() {
    const r = game.rope; if (!r || r.pressed === r.cycle) return; r.pressed = r.cycle;
    if (r.phase >= 0.36 && r.phase <= 0.64) { r.count++; AU.boing(); $('ropeCount').textContent = r.count + '/5'; if (r.count >= 5) { game.rope = null; hide('rope'); skippy.cool = 25; skippy.path = []; skippy.wait = 0; ui.sub('Skippy: Yay! That was fun! Bye!', '#f48fb1'); } }
    else { r.count = 0; $('ropeCount').textContent = '0/5'; AU.wrong(); ui.sub('Skippy: Oops! Start over!', '#f48fb1', 2); }
  }

  // ---------- Broom Bot ----------
  function updateBroom(dt) {
    broom.pushCool -= dt;
    if (broom.pause > 0) { broom.pause -= dt; if (broom.pause <= 0) chooseBroomDir(); }
    else {
      const tx = (broom.tx + 0.5) * S, tz = (broom.ty + 0.5) * S, dx = tx - broom.x, dz = tz - broom.z, d = Math.hypot(dx, dz), step = 12 * dt;
      if (d <= step) { broom.x = tx; broom.z = tz; broom.cx = broom.tx; broom.cy = broom.ty; if (ch(broom.cx + broom.dx, broom.cy + broom.dy) === '.') { broom.tx += broom.dx; broom.ty += broom.dy; } else broom.pause = 1 + Math.random() * 1.5; }
      else { broom.x += dx / d * step; broom.z += dz / d * step; }
      broom.whirT -= dt; if (broom.whirT <= 0) { broom.whirT = 0.16; const s = spatial(broom.x, broom.z, 26); AU.whirr(s.vol, s.pan); }
      if (broom.pushCool <= 0 && distP(broom) < 1.5) {
        player.pushX = broom.dx * 18; player.pushZ = broom.dy * 18; player.pushT = 0.6; broom.pushCool = 2; game.rope = null; hide('rope');
        ui.sub('*WHIRRR* Broom Bot sweeps you away!', '#ffcc80', 2);
      }
    }
    broom.frameT += dt; if (broom.frameT > 0.08) { broom.frameT = 0; broom.frame ^= 1; } setMap(broom.mesh, TX.broom[broom.frame]);
  }
  function chooseBroomDir() {
    const opts = LG.DIRS.filter(function (d) { return ch(broom.cx + d[0], broom.cy + d[1]) === '.'; });
    let o = opts.filter(function (d) { return !(d[0] === -broom.dx && d[1] === -broom.dy); }); if (!o.length) o = opts; if (!o.length) return;
    const d = o[(Math.random() * o.length) | 0]; broom.dx = d[0]; broom.dy = d[1]; broom.tx = broom.cx + d[0]; broom.ty = broom.cy + d[1];
  }

  // ---------- Byte ----------
  function updateByte(dt) {
    wander(byte, dt, 3, walkCells); byte.beepT -= dt;
    byte.frameT += dt; if (byte.frameT > 0.5) { byte.frameT = 0; byte.frame ^= 1; } setMap(byte.mesh, TX.byte[byte.frame]);
    if (!byte.given && distP(byte) < 2.4) {
      byte.given = true; const t = ['drink', 'bell', 'pass'][(Math.random() * 3) | 0]; addPickup(t, byte.x, byte.z, 0); AU.beep(1, 0);
      ui.sub('Byte: Beep-boop! A gift for you: ' + ITEM_NAMES[t] + '!', '#80deea', 3.5);
    } else if (byte.given && byte.beepT <= 0 && distP(byte) < 6) { byte.beepT = 8; const s = spatial(byte.x, byte.z, 15); AU.beep(s.vol, s.pan); ui.sub('Byte: Beep!', '#80deea', 1.5); }
  }

  // ---------- pickups / items ----------
  function findTarget() {
    const F = fwd(); let best = null, bd = 1e9;
    for (const p of pickups) {
      if (!p.alive) continue; const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz); if (d > 3.4) continue;
      const dot = (dx * F.x + dz * F.z) / (d || 1); if (d > 1.4 && dot < 0.72) continue; if (!los(player.x, player.z, p.x, p.z)) continue;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function interact() {
    if (game.state !== 'play') return;
    if (game.rope) { ropePress(); return; }
    const p = findTarget(); if (!p) return;
    if (p.type === 'ipad') { openQuiz(p); return; }
    const slot = inv[sel] === null ? sel : inv.indexOf(null);
    if (slot < 0) { ui.sub('Your pockets are full! Use an item first.', '#fff', 2); return; }
    inv[slot] = p.type; p.alive = false; p.mesh.visible = false; AU.pickup(); ui.sub('Got: ' + ITEM_NAMES[p.type], '#fff', 2); updateHUD();
  }
  function useItem() {
    if (game.state !== 'play') return;
    let i = sel; if (!inv[i]) i = inv.findIndex(function (v) { return v; }); if (i < 0) return;
    const it = inv[i]; inv[i] = null;
    if (it === 'drink') { player.stamina = 100; game.drinkT = 7; AU.drink(); ui.sub('*GLUG* ZAP! Unlimited running for a bit!', '#81d4fa', 2.5); }
    else if (it === 'bell') { game.bell = { x: player.x, z: player.z, t: 10 }; AU.bell(); ui.sub('*DING DING DING* Mr. Luke goes to check the quiet zone bell...', '#ffe082', 3); }
    else if (it === 'pass') { if (game.det > 0) endDetention('Hall Pass! You are free to go.'); else { game.passT = 30; ui.sub('Hall Pass: Principal Grant will ignore you for 30s.', '#90caf9', 3); } AU.pickup(); }
    updateHUD();
  }

  // ---------- quiz ----------
  const KB_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  (function buildKbd() {
    const k = $('kbd');
    KB_ROWS.forEach(function (row, ri) {
      const r = document.createElement('div'); r.className = 'krow';
      row.split('').forEach(function (c) { r.appendChild(mkKey(c, c)); });
      if (ri === 2) r.appendChild(mkKey('DEL', 'BACK', true));
      if (ri === 3) r.appendChild(mkKey('ENTER', 'ENTER', true));
      k.appendChild(r);
    });
    function mkKey(label, val, wide) {
      const b = document.createElement('button'); b.className = 'key' + (wide ? ' wide' : ''); b.textContent = label;
      const fire = function (e) { e.preventDefault(); e.stopPropagation(); quizKey(val); };
      b.addEventListener('touchstart', fire, { passive: false }); b.addEventListener('mousedown', fire); return b;
    }
  })();
  let wantLockAfterQuiz = false;
  function openQuiz(p) {
    game.state = 'quiz';
    game.quiz = { p: p, n: game.collected + 1, qs: LG.makeQuiz(game.collected >= 1), i: 0, ans: '', results: [], busy: false };
    show('quiz'); renderQuiz(); AU.pickup(); unlockPointer();
  }
  function renderQuiz() {
    const q = game.quiz, cur = q.qs[q.i];
    $('quizTitle').textContent = "Mr. Luke's iPad #" + q.n; $('quizProg').textContent = 'Question ' + (q.i + 1) + '/3';
    $('quizKind').textContent = cur.kind; $('quizQ').textContent = cur.q; $('quizQ').classList.toggle('glitch', !!cur.glitch);
    $('quizAnsText').textContent = q.ans; if (!q.busy) { $('quizFb').textContent = ''; $('quizFb').className = ''; }
    if (cur.glitch && !q.glitchPlayed) { q.glitchPlayed = true; AU.glitch(); }
  }
  function quizKey(k) {
    const q = game.quiz; if (game.state !== 'quiz' || !q || q.busy) return;
    if (k === 'BACK') q.ans = q.ans.slice(0, -1);
    else if (k === 'ENTER') { submitAnswer(); return; }
    else if (q.ans.length < 16) { q.ans += k; AU.ui(); if (q.qs[q.i].glitch && Math.random() < 0.5) q.ans = LG.zalgo(q.ans).slice(0, 30); }
    renderQuiz();
  }
  function submitAnswer() {
    const q = game.quiz, cur = q.qs[q.i]; if (!q.ans && !cur.glitch) return;
    const ok = LG.checkAnswer(cur, q.ans); q.results.push(ok); q.busy = true;
    const fb = $('quizFb'); fb.textContent = ok ? 'Correct!' : (cur.glitch ? 'E R R O R . . .' : 'Wrong! (answer: ' + cur.a[0] + ')'); fb.className = ok ? 'ok' : 'bad';
    if (ok) { AU.correct(); VO.play('correct'); } else { AU.wrong(); if (game.anger > 0) VO.play('wrong'); }
    setTimeout(function () { q.busy = false; q.i++; q.ans = ''; q.glitchPlayed = false; if (q.i < 3) renderQuiz(); else finishQuiz(); }, ok ? 800 : 1400);
  }
  function finishQuiz() {
    const q = game.quiz; const wrong = q.results.filter(function (r) { return !r; }).length;
    q.p.alive = false; q.p.mesh.visible = false; game.collected++; hide('quiz'); game.state = 'play'; game.quiz = null;
    if (wrong > 0) {
      const first = game.anger <= 0; game.anger += wrong;
      if (first) { luke.pulseT = 1.2; VO.play('chase_start'); } else { VO.play(Math.random() < 0.5 ? 'bonus_say_no_more' : 'bonus_now_while_you_can_do_it'); setTimeout(function () { ui.sub('Mr. Luke is getting faster... (' + wrong + ' wrong)', '#ff8a80', 2.5); }, 2600); }
    } else VO.play('notebook_' + game.collected, 'ipad_' + game.collected);
    if (game.collected >= 7) setTimeout(startEscape, 1200);
    updateHUD(); lockPointer();
  }

  // ---------- escape sequence ----------
  function redLevel(lvl) {
    const tint = new THREE.Color(1, 1 - 0.55 * lvl, 1 - 0.6 * lvl); game.tint = tint;
    world.setTint(tint); pickups.forEach(function (p) { p.mesh.material.color.copy(tint); });
    const fog = FOG_BASE.clone().lerp(FOG_RED, Math.min(1, lvl * 1.1)); scene.background.copy(fog); scene.fog.color.copy(fog);
    scene.fog.far = 44 - lvl * 14; $('vignette').classList.toggle('red', lvl > 0);
    AU.droneLevel(lvl);
  }
  function startEscape() {
    if (game.escape || game.state === 'over') return;
    game.escape = true; game.exitsHit = 0; game.anger += 2;
    world.exits.forEach(function (e) { world.setExitState(e, 'open'); });
    AU.droneStart(); redLevel(0.15); VO.play('exit_start'); updateHUD(true);
  }
  function reachExit(e) {
    world.setExitState(e, 'used'); game.exitsHit++; AU.exitHit();
    if (game.exitsHit >= 4) { win(); return; }
    game.anger += 2; redLevel(0.15 + game.exitsHit * 0.25); VO.play('exit_' + game.exitsHit); updateHUD(true);
  }

  // ---------- end states ----------
  function gameOver() {
    if (game.state !== 'play') return; game.state = 'over'; AU.lose(); AU.droneStop(); VO.play('caught'); unlockPointer();
    $('overMsg').textContent = 'Mr. Luke caught you with ' + game.collected + '/7 iPads' + (game.escape ? ' and ' + game.exitsHit + '/4 exits' : '') + '.';
    hide('hud'); hide('quiz'); onlyScreen('over');
  }
  function win() {
    game.state = 'win'; AU.droneStop(); AU.win(); VO.play('win'); unlockPointer();
    const t = Math.floor(game.time); $('winMsg').textContent = 'All 7 iPads, all 4 exits. Time: ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    hide('hud'); onlyScreen('win');
  }

  // ---------- pointer lock ----------
  let suppressPause = false;
  function lockPointer() { if (isTouch || !canvas.requestPointerLock) return; if (document.pointerLockElement === canvas) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () { }); } catch (e) { } }
  function unlockPointer() { if (document.pointerLockElement) { suppressPause = true; document.exitPointerLock(); } }
  document.addEventListener('pointerlockchange', function () {
    if (!document.pointerLockElement) { if (suppressPause) { suppressPause = false; return; } if (game.state === 'play') pauseGame(); }
  });
  let mouseDrag = false, lmx = 0, lmy = 0;
  canvas.addEventListener('mousedown', function (e) {
    if (game.state !== 'play' || isTouch) return;
    if (document.pointerLockElement !== canvas) { lockPointer(); mouseDrag = true; lmx = e.clientX; lmy = e.clientY; return; }
    if (e.button === 0) interact(); else if (e.button === 2) useItem();
  });
  window.addEventListener('mouseup', function () { mouseDrag = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('mousemove', function (e) {
    if (game.state !== 'play') return;
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0024);
    else if (mouseDrag) { look(e.clientX - lmx, e.clientY - lmy, 0.004); lmx = e.clientX; lmy = e.clientY; }
  });

  // ---------- keyboard ----------
  window.addEventListener('keydown', function (e) {
    if (game.state === 'quiz') {
      if (e.key === 'Backspace') { quizKey('BACK'); e.preventDefault(); }
      else if (e.key === 'Enter') { quizKey('ENTER'); e.preventDefault(); }
      else if (/^[a-zA-Z0-9]$/.test(e.key)) quizKey(e.key.toUpperCase());
      return;
    }
    if (game.state === 'play') {
      keys[e.code] = true;
      if (e.code === 'KeyE') interact();
      else if (e.code === 'Space') { if (game.rope) ropePress(); else interact(); e.preventDefault(); }
      else if (e.code === 'KeyQ' || e.code === 'KeyF') useItem();
      else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { sel = +e.code.slice(5) - 1; updateHUD(); }
      else if (e.code === 'KeyM') { settings.minimap = !settings.minimap; saveSettings(); updateHUD(); }
      else if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
    } else if (game.state === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resumeGame();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; if (game.state === 'play') pauseGame(); });
  window.addEventListener('wheel', function (e) { if (game.state === 'play') { sel = (sel + (e.deltaY > 0 ? 1 : 2)) % 3; updateHUD(); } });

  // ---------- touch ----------
  if (isTouch) { show('touch'); show('touchLayer'); hide('crosshair'); }
  const tl = $('touchLayer'), jb = $('joyBase'), jk = $('joyKnob');
  tl.addEventListener('touchstart', function (e) {
    e.preventDefault(); if (game.state !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.42 && joy.id === null) { joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0; jb.style.display = 'block'; jb.style.left = (t.clientX - 60) + 'px'; jb.style.top = (t.clientY - 60) + 'px'; jb.style.bottom = 'auto'; jk.style.left = '35px'; jk.style.top = '35px'; }
      else if (lookId === null) { lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }
    }
  }, { passive: false });
  tl.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy; const d = Math.hypot(dx, dy), m = 55; if (d > m) { dx *= m / d; dy *= m / d; } joy.x = dx / m; joy.y = dy / m; jk.style.left = (35 + dx) + 'px'; jk.style.top = (35 + dy) + 'px'; }
      else if (t.identifier === lookId) { if (game.state === 'play') look(t.clientX - lookX, t.clientY - lookY, 0.0055); lookX = t.clientX; lookY = t.clientY; }
    }
  }, { passive: false });
  function endTouch(e) { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; jb.style.display = 'none'; } if (t.identifier === lookId) lookId = null; } }
  tl.addEventListener('touchend', endTouch); tl.addEventListener('touchcancel', endTouch);
  function tap(id, fn) { const el = $(id); el.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false }); el.addEventListener('click', function (e) { if (!isTouch) fn(); }); }
  tap('btnUse', interact); tap('btnItem', useItem); tap('btnJump', ropePress);
  tap('btnRun', function () { game.runToggle = !game.runToggle; updateHUD(); });
  tap('btnPause', function () { if (game.state === 'play') pauseGame(); });
  document.querySelectorAll('.slot').forEach(function (el) { const fn = function (e) { e.preventDefault(); e.stopPropagation(); sel = +el.dataset.i; updateHUD(); }; el.addEventListener('touchstart', fn, { passive: false }); el.addEventListener('mousedown', fn); });

  // ---------- menus ----------
  let settingsReturn = 'title';
  function btn(id, fn) { $(id).addEventListener('click', function (e) { AU.init(); AU.ui(); fn(e); }); }
  function startGame() {
    AU.init(); AU.setVolume(settings.vol); VO.probeAll();
    if (isTouch) { try { const el = document.documentElement; const r = (el.requestFullscreen || el.webkitRequestFullscreen || function () { }).call(el); if (r && r.then) r.then(function () { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { }); }).catch(function () { }); } catch (e) { } }
    newGame(); onlyScreen(null); show('hud'); game.state = 'play'; lockPointer();
    setTimeout(function () { if (game.state === 'play') VO.play('intro'); }, 600);
  }
  function pauseGame() { if (game.state !== 'play') return; game.state = 'pause'; onlyScreen('pause'); for (const k in keys) keys[k] = false; unlockPointer(); }
  function resumeGame() { onlyScreen(null); game.state = 'play'; lockPointer(); }
  function toTitle() { game.state = 'title'; hide('hud'); hide('quiz'); hide('rope'); AU.droneStop(); newGame(); onlyScreen('title'); }
  btn('btnStart', startGame); btn('btnRetry', startGame); btn('btnAgain', startGame);
  btn('btnHow', function () { onlyScreen('howto'); });
  btn('btnCredits', function () { onlyScreen('credits'); });
  // Android back button: returns true if handled, false if the app may close (title screen)
  window.LukeBack = function () {
    try {
      const vis = function (id) { return !$(id).classList.contains('hidden'); };
      if (vis('settings')) { onlyScreen(settingsReturn); return true; }
      if (vis('howto') || vis('credits')) { onlyScreen('title'); return true; }
      if (game.state === 'play') { pauseGame(); return true; }
      if (game.state === 'pause') { resumeGame(); return true; }
      if (game.state === 'over' || game.state === 'win') { toTitle(); return true; }
      if (game.state === 'title') return false;
      return true;
    } catch (e) { return false; }
  };
  btn('btnSettings', function () { settingsReturn = 'title'; openSettings(); });
  btn('btnPSettings', function () { settingsReturn = 'pause'; openSettings(); });
  btn('btnResume', resumeGame); btn('btnQuit', toTitle); btn('btnOverTitle', toTitle); btn('btnWinTitle', toTitle);
  document.querySelectorAll('.back').forEach(function (b) { b.addEventListener('click', function () { AU.ui(); onlyScreen(b.closest('#settings') ? settingsReturn : 'title'); }); });
  function openSettings() {
    $('setSens').value = settings.sens; $('setVol').value = settings.vol; $('setQ').value = settings.quality; $('setMap').checked = settings.minimap; refreshSetLabels(); onlyScreen('settings');
  }
  function refreshSetLabels() { $('setSensV').textContent = (+settings.sens).toFixed(1); $('setVolV').textContent = Math.round(settings.vol * 100) + '%'; }
  $('setSens').addEventListener('input', function (e) { settings.sens = +e.target.value; refreshSetLabels(); saveSettings(); });
  $('setVol').addEventListener('input', function (e) { settings.vol = +e.target.value; AU.setVolume(settings.vol); refreshSetLabels(); saveSettings(); });
  $('setQ').addEventListener('change', function (e) { settings.quality = e.target.value; applyQuality(); saveSettings(); });
  $('setMap').addEventListener('change', function (e) { settings.minimap = e.target.checked; saveSettings(); updateHUD(); });
  ['titleArt', 'overArt'].forEach(function (id) { const c = $(id), x = c.getContext('2d'); x.drawImage(T.luke(id === 'overArt' ? 'up' : 'idle', id === 'overArt'), 0, 0); });

  // ---------- main loop ----------
  let last = performance.now(), frame = 0, titleT = 0;
  function update(dt) {
    game.time += dt;
    if (game.drinkT > 0) game.drinkT -= dt; if (game.passT > 0) game.passT -= dt;
    if (game.bell) { game.bell.t -= dt; if (game.bell.t <= 0) game.bell = null; }
    updatePlayer(dt); if (game.state !== 'play') return;
    updateDetention(dt); updateRope(dt);
    updateLuke(dt); if (game.state !== 'play') return;
    updateGrant(dt); updateSkippy(dt); updateBroom(dt); updateByte(dt); updateDoors(dt);
    const tgt = game.rope ? null : findTarget();
    const pr = $('prompt');
    if (tgt) { const txt = (isTouch ? 'USE: ' : 'E / Click: ') + (tgt.type === 'ipad' ? "Mr. Luke's iPad" : ITEM_NAMES[tgt.type]); if (pr.textContent !== txt) pr.textContent = txt; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
    if (frame % 3 === 0) drawMinimap();
    updateHUD();
  }
  function placeSprites() {
    const cx = camera.position.x, cz = camera.position.z;
    npcs.forEach(function (n) { n.mesh.position.set(n.x, n.mesh.userData.h / 2 + (n === skippy && game.rope && skippy.frame === 2 ? 0.25 : 0), n.z); n.mesh.rotation.y = Math.atan2(cx - n.x, cz - n.z); });
    pickups.forEach(function (p) { if (!p.alive) return; p.mesh.position.set(p.x, 1.0 + Math.sin(game.time * 2.5 + p.phase) * 0.12, p.z); p.mesh.rotation.y = Math.atan2(cx - p.x, cz - p.z); });
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    if (game.state === 'play') update(dt);
    else if (game.state === 'title') { titleT += dt; camera.position.set((12.5) * S, 1.7, (18.5) * S); camera.rotation.set(0, titleT * 0.15, 0); updateDoors(dt); }
    placeSprites();
    renderer.render(scene, camera);
  }
  newGame(); onlyScreen('title');
  requestAnimationFrame(loop);

  // Test / debug hooks (harmless in production)
  LG.api = {
    game: game, player: player, luke: luke, npcs: { luke: luke, grant: grant, skippy: skippy, broom: broom, byte: byte }, world: world, pickups: function () { return pickups; }, inv: inv,
    start: startGame, interact: interact, useItem: useItem, quizKey: quizKey, openQuiz: openQuiz, startEscape: startEscape, reachExit: reachExit, sendToDetention: sendToDetention, startRope: startRope, ropePress: ropePress,
    tick: function (n, dt) { for (let i = 0; i < n; i++) { if (game.state === 'play') update(dt || 1 / 60); } placeSprites(); renderer.render(scene, camera); },
    render: function () { placeSprites(); camera.position.set(player.x, 1.7, player.z); camera.rotation.y = player.yaw; camera.rotation.x = player.pitch; renderer.render(scene, camera); },
    bfs: bfs, layout: L
  };
})();
