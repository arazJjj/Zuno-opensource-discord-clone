/* School layout + merged low-poly geometry. */
(function () {
  'use strict';
  const LG = window.LG;
  const S = 4, WH = 4.5; LG.S = S; LG.WH = WH;
  const DIRS = [[0, -1, 'N'], [0, 1, 'S'], [-1, 0, 'W'], [1, 0, 'E']];
  LG.DIRS = DIRS;

  LG.buildLayout = function () {
    const W = 37, H = 29; const g = [], rm = [];
    for (let y = 0; y < H; y++) { g.push(new Array(W).fill('#')); rm.push(new Array(W).fill(-1)); }
    const hallRows = [1, 9, 18, 27], hallCols = [1, 12, 24, 35];
    for (const y of hallRows) for (let x = 1; x <= 35; x++) g[y][x] = '.';
    for (const x of hallCols) for (let y = 1; y <= 27; y++) g[y][x] = '.';
    // dead ends to make it a maze
    [[12, 5], [24, 22], [30, 9], [6, 27], [1, 14]].forEach(function (p) { g[p[1]][p[0]] = '#'; });
    const bx = [[2, 11], [13, 23], [25, 34]], by = [[2, 8], [10, 17], [19, 26]];
    const plan = { '0,0': 'split', '1,0': 'one', '2,0': 'split', '0,1': 'one', '1,1': 'office', '2,1': 'split', '0,2': 'det', '1,2': 'one', '2,2': 'split' };
    const rooms = [];
    function addRoom(x0, x1, y0, y1, type) {
      const id = rooms.length;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g[y][x] = 'r'; rm[y][x] = id; }
      rooms.push({ id: id, x0: x0, x1: x1, y0: y0, y1: y1, type: type }); return rooms[id];
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x0 = bx[i][0] + 1, x1 = bx[i][1] - 1, y0 = by[j][0] + 1, y1 = by[j][1] - 1; const p = plan[i + ',' + j];
      if (p === 'split' || p === 'det') { const mid = Math.floor((x0 + x1) / 2); addRoom(x0, mid - 1, y0, y1, p === 'det' ? 'det' : 'class'); addRoom(mid + 1, x1, y0, y1, 'class'); }
      else addRoom(x0, x1, y0, y1, p === 'office' ? 'office' : 'class');
    }
    const rnd = LG.tex.rng(1337); let num = 101;
    const doors = [];
    for (const r of rooms) {
      const mx = Math.floor((r.x0 + r.x1) / 2), my = Math.floor((r.y0 + r.y1) / 2);
      const opts = [{ x: mx, y: r.y0 - 1, bx: mx, by: r.y0 - 2, side: 'N' }, { x: mx, y: r.y1 + 1, bx: mx, by: r.y1 + 2, side: 'S' }, { x: r.x0 - 1, y: my, bx: r.x0 - 2, by: my, side: 'W' }, { x: r.x1 + 1, y: my, bx: r.x1 + 2, by: my, side: 'E' }];
      const cands = opts.filter(function (o) { return o.by >= 0 && o.by < H && o.bx >= 0 && o.bx < W && g[o.by][o.bx] === '.'; });
      const pick = r.type === 'office' ? cands.find(function (o) { return o.side === 'S'; }) : (r.type === 'det' ? (cands.find(function (o) { return o.side === 'N'; }) || cands[0]) : cands[(rnd() * cands.length) | 0]);
      g[pick.y][pick.x] = 'D'; r.door = pick;
      r.name = r.type === 'office' ? "MR. LUKE" : r.type === 'det' ? 'DETENTION' : ('ROOM ' + (num++));
      doors.push({ x: pick.x, y: pick.y, side: pick.side, room: r.id, outX: pick.bx, outY: pick.by });
    }
    const exits = [{ x: 0, y: 9, ix: 1, iy: 9 }, { x: 36, y: 18, ix: 35, iy: 18 }, { x: 18, y: 0, ix: 18, iy: 1 }, { x: 18, y: 28, ix: 18, iy: 27 }];
    exits.forEach(function (e) { g[e.y][e.x] = 'E'; });
    const office = rooms.find(function (r) { return r.type === 'office'; });
    const det = rooms.find(function (r) { return r.type === 'det'; });
    const L = { W: W, H: H, grid: g, roomMap: rm, rooms: rooms, doors: doors, exits: exits, office: office, det: det,
      playerStart: { x: 16, y: 18 }, lukeStart: { x: Math.floor((office.x0 + office.x1) / 2), y: Math.floor((office.y0 + office.y1) / 2) } };
    // connectivity check
    const seen = new Set([L.playerStart.y * W + L.playerStart.x]); const q = [[L.playerStart.x, L.playerStart.y]];
    while (q.length) { const c = q.shift(); for (const d of DIRS) { const nx = c[0] + d[0], ny = c[1] + d[1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ch = g[ny][nx]; if (ch === '#' || ch === 'E') continue; const k = ny * W + nx; if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
    let total = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] !== '#' && g[y][x] !== 'E') total++;
    L.connected = seen.size === total; L.walkCount = total;
    return L;
  };

  LG.buildWorld = function (scene) {
    const T = LG.tex; const L = LG.buildLayout(); const g = L.grid;
    const tex = {
      fHall: T.toTex(T.hallFloor()), fCarpet0: T.toTex(T.carpet('#3f6d8c', '#5f8fae', 5)), fCarpet1: T.toTex(T.carpet('#7a3b46', '#9a5b66', 8)), fCarpet2: T.toTex(T.carpet('#4d7a45', '#6d9a65', 9)),
      fWood: T.toTex(T.woodFloor()), fDet: T.toTex(T.concrete('#77797b')),
      ceil: T.toTex(T.ceiling(false)), ceilLight: T.toTex(T.ceiling(true)),
      wHall: T.toTex(T.wallHall()), wClass: T.toTex(T.wallClass()), wOffice: T.toTex(T.wallOffice()), wDet: T.toTex(T.wallDet()),
      chalk: T.toTex(T.chalkboard()), poster: T.toTex(T.posters())
    };
    const acc = {};
    function A(k) { return acc[k] || (acc[k] = { p: [], uv: [], c: [], i: [] }); }
    function quad(k, a, b, c, d, sb, st, uvs) {
      const o = A(k); const n = o.p.length / 3;
      o.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      const u = uvs || [0, 0, 1, 0, 1, 1, 0, 1]; for (let i = 0; i < 8; i++) o.uv.push(u[i]);
      o.c.push(sb, sb, sb, sb, sb, sb, st, st, st, st, st, st); o.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    // wall-plane quad helper: side = which wall (relative to viewer inside the cell)
    function wallQuad(k, side, plane, c, w, y0, y1, off, sb, st, uvs) {
      const h = w / 2; let a, b, cc, d;
      if (side === 'N') { const z = plane + off; a = [c - h, y0, z]; b = [c + h, y0, z]; cc = [c + h, y1, z]; d = [c - h, y1, z]; }
      else if (side === 'S') { const z = plane - off; a = [c + h, y0, z]; b = [c - h, y0, z]; cc = [c - h, y1, z]; d = [c + h, y1, z]; }
      else if (side === 'W') { const xx = plane + off; a = [xx, y0, c + h]; b = [xx, y0, c - h]; cc = [xx, y1, c - h]; d = [xx, y1, c + h]; }
      else { const xx = plane - off; a = [xx, y0, c - h]; b = [xx, y0, c + h]; cc = [xx, y1, c + h]; d = [xx, y1, c - h]; }
      quad(k, a, b, cc, d, sb, st, uvs);
    }
    function planeFor(x, y, side) { return side === 'N' ? y * S : side === 'S' ? (y + 1) * S : side === 'W' ? x * S : (x + 1) * S; }
    function centerFor(x, y, side) { return (side === 'N' || side === 'S') ? (x + 0.5) * S : (y + 0.5) * S; }
    const prnd = T.rng(99);
    const exitFaces = [];
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const ch = g[y][x]; if (ch === '#' || ch === 'E') continue;
      const rid = L.roomMap[y][x]; const room = rid >= 0 ? L.rooms[rid] : null;
      let fk = 'fHall', wk = 'wHall';
      if (room) { if (room.type === 'office') { fk = 'fWood'; wk = 'wOffice'; } else if (room.type === 'det') { fk = 'fDet'; wk = 'wDet'; } else { fk = 'fCarpet' + (rid % 3); wk = 'wClass'; } }
      const x0 = x * S, x1 = x0 + S, z0 = y * S, z1 = z0 + S;
      quad(fk, [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], 1, 1);
      const lit = room ? ((x + y) % 2 === 0) : ((x * 7 + y * 3) % 4 === 0);
      quad(lit ? 'ceilLight' : 'ceil', [x0, WH, z0], [x1, WH, z0], [x1, WH, z1], [x0, WH, z1], 0.97, 0.97);
      for (const d of DIRS) {
        const nx = x + d[0], ny = y + d[1]; const nch = (ny < 0 || nx < 0 || ny >= L.H || nx >= L.W) ? '#' : g[ny][nx];
        if (nch !== '#' && nch !== 'E') continue;
        const side = d[2]; const shade = (side === 'N' || side === 'S') ? 0.86 : 1.0;
        if (nch === 'E') { exitFaces.push({ x: x, y: y, side: side, ex: nx, ey: ny }); continue; }
        wallQuad(wk, side, planeFor(x, y, side), centerFor(x, y, side), S, 0, WH, 0, shade * 0.72, shade);
        if (ch === '.' && prnd() < 0.09) {
          const pi = (prnd() * 4) | 0; const u0 = (pi % 2) * 0.5, v0 = pi < 2 ? 0.5 : 0;
          wallQuad('poster', side, planeFor(x, y, side), centerFor(x, y, side) + (prnd() - 0.5), 1.5, 1.7, 3.2, 0.03, shade, shade, [u0, v0, u0 + 0.5, v0, u0 + 0.5, v0 + 0.5, u0, v0 + 0.5]);
        }
      }
    }
    // chalkboards on wall opposite each classroom door
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' };
    for (const r of L.rooms) {
      if (r.type === 'det') continue;
      const side = opp[r.door.side]; let plane, c, len;
      if (side === 'N') { plane = r.y0 * S; c = (r.x0 + r.x1 + 1) / 2 * S; len = (r.x1 - r.x0 + 1) * S; }
      else if (side === 'S') { plane = (r.y1 + 1) * S; c = (r.x0 + r.x1 + 1) / 2 * S; len = (r.x1 - r.x0 + 1) * S; }
      else if (side === 'W') { plane = r.x0 * S; c = (r.y0 + r.y1 + 1) / 2 * S; len = (r.y1 - r.y0 + 1) * S; }
      else { plane = (r.x1 + 1) * S; c = (r.y0 + r.y1 + 1) / 2 * S; len = (r.y1 - r.y0 + 1) * S; }
      const w = Math.min(len - 1.5, 6.5);
      wallQuad('chalk', side, plane, c, w, 1.3, 1.3 + w / 2.2, 0.04, 1, 1);
    }
    const mats = [];
    const group = new THREE.Group(); scene.add(group);
    for (const k in acc) {
      const o = acc[k]; const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
      geo.setIndex(o.i);
      const mat = new THREE.MeshBasicMaterial({ map: tex[k], vertexColors: true });
      if (k === 'poster' || k === 'chalk') { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; }
      mats.push(mat); group.add(new THREE.Mesh(geo, mat));
    }
    // doors
    const doorAt = {}; const doorGeo = new THREE.BoxGeometry(S, WH, 0.3);
    const doors = L.doors.map(function (d) {
      const r = L.rooms[d.room]; const kind = r.type === 'det' ? 'det' : r.type === 'office' ? 'office' : 'class';
      const mat = new THREE.MeshBasicMaterial({ map: T.toTex(T.door(r.name, kind)) }); mats.push(mat);
      const mesh = new THREE.Mesh(doorGeo, mat);
      mesh.position.set((d.x + 0.5) * S, WH / 2, (d.y + 0.5) * S);
      if (d.side === 'W' || d.side === 'E') mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
      const obj = { x: d.x, y: d.y, cx: (d.x + 0.5) * S, cz: (d.y + 0.5) * S, outX: d.outX, outY: d.outY, mesh: mesh, open: 0, locked: false, room: r, wasOpen: false };
      doorAt[d.y * L.W + d.x] = obj; return obj;
    });
    // exits (one material each so each can change state)
    const exitTex = { closed: T.toTex(T.exitDoor('closed')), open: T.toTex(T.exitDoor('open')), used: T.toTex(T.exitDoor('used')) };
    const exits = L.exits.map(function (e) {
      const f = exitFaces.find(function (ff) { return ff.ex === e.x && ff.ey === e.y; });
      const mat = new THREE.MeshBasicMaterial({ map: exitTex.closed }); mats.push(mat);
      const geo = new THREE.PlaneGeometry(S, WH); const m = new THREE.Mesh(geo, mat);
      const yaw = { N: 0, S: Math.PI, W: -Math.PI / 2, E: Math.PI / 2 }[f.side];
      // plane faces +z by default; rotate so it faces into the hall cell
      const px = f.side === 'W' ? f.x * S : f.side === 'E' ? (f.x + 1) * S : (f.x + 0.5) * S;
      const pz = f.side === 'N' ? f.y * S : f.side === 'S' ? (f.y + 1) * S : (f.y + 0.5) * S;
      m.position.set(px, WH / 2, pz); m.rotation.y = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[f.side]; void yaw;
      scene.add(m);
      return { x: e.x, y: e.y, ix: e.ix, iy: e.iy, mesh: m, mat: mat, state: 'closed', cx: (e.ix + 0.5) * S, cz: (e.iy + 0.5) * S };
    });
    function setExitState(e, st) { e.state = st; e.mat.map = exitTex[st]; e.mat.needsUpdate = true; }
    function setTint(c) { mats.forEach(function (m) { m.color.copy(c); }); }
    return { layout: L, doors: doors, doorAt: doorAt, exits: exits, setExitState: setExitState, setTint: setTint, mats: mats };
  };
})();
