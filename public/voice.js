// Zuno voice & video: voice channels, DM calls, camera, screen share, whiteboard, watch together.
// Peer-to-peer WebRTC mesh, signalling over Socket.IO ("perfect negotiation").
window.ZV = (() => {
  const V = { room: null, roomName: '', rooms: {}, peers: new Map(), mic: null, cam: null, screen: null, muted: false, deaf: false, ice: null, activity: null, stageOpen: false };
  let sock = null;
  const $ = (s, r = document) => r.querySelector(s);
  const esc0 = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const user = (uid) => S.users[uid] || (uid === S.me?.id ? S.me : { id: uid, display_name: 'Someone' });
  const micPrefs = () => { try { return JSON.parse(localStorage.zunoMic || '{}'); } catch { return {}; } };
  const signal = (to, data) => sock.emit('voice:signal', { to, data });
  const sendState = () => sock?.emit('voice:state', { muted: V.muted || V.deaf, deaf: V.deaf, video: !!V.cam, screen: !!V.screen });

  // ---------- media ----------
  async function getMic() {
    const p = micPrefs();
    return navigator.mediaDevices.getUserMedia({ audio: { deviceId: p.device ? { ideal: p.device } : undefined, echoCancellation: p.echo !== false, noiseSuppression: p.noise !== false, autoGainControl: true }, video: false });
  }
  function localTracks() {
    const out = [];
    if (V.mic) V.mic.getAudioTracks().forEach((t) => out.push([t, V.mic]));
    if (V.cam) V.cam.getVideoTracks().forEach((t) => out.push([t, V.cam]));
    if (V.screen) V.screen.getTracks().forEach((t) => out.push([t, V.screen]));
    return out;
  }

  // ---------- peers ----------
  function makePeer(sid, uid) {
    if (V.peers.has(sid)) return V.peers.get(sid);
    const pc = new RTCPeerConnection({ iceServers: V.ice || [{ urls: 'stun:stun.l.google.com:19302' }] });
    const p = { pc, uid, sid, polite: sock.id > sid, makingOffer: false, ignoreOffer: false, audio: null, videos: new Map(), senders: new Map() };
    V.peers.set(sid, p);
    for (const [t, s] of localTracks()) p.senders.set(t.id, pc.addTrack(t, s));
    pc.onicecandidate = (e) => e.candidate && signal(sid, { candidate: e.candidate });
    pc.onnegotiationneeded = async () => { try { p.makingOffer = true; await pc.setLocalDescription(); signal(sid, { description: pc.localDescription }); } catch (e) { console.warn(e); } finally { p.makingOffer = false; } };
    pc.oniceconnectionstatechange = () => { if (pc.iceConnectionState === 'failed') pc.restartIce?.(); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (e.track.kind === 'audio') {
        if (!p.audio) { p.audio = new Audio(); p.audio.autoplay = true; p.audio.playsInline = true; document.body.appendChild(p.audio); }
        if (stream.getVideoTracks().length) { const a = new MediaStream(stream.getAudioTracks()); p.audio2 = p.audio2 || new Audio(); p.audio2.srcObject = a; p.audio2.muted = V.deaf; p.audio2.play().catch(() => {}); }
        else { p.audio.srcObject = stream; p.audio.muted = V.deaf; p.audio.play().catch(() => {}); watchLevel(uid, stream); }
      } else {
        p.videos.set(stream.id, stream);
        const drop = () => { if (!stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted)) { p.videos.delete(stream.id); renderStage(); } };
        stream.onremovetrack = drop; e.track.onended = drop; e.track.onmute = () => setTimeout(drop, 400); e.track.onunmute = () => { p.videos.set(stream.id, stream); renderStage(); };
        renderStage();
      }
    };
    return p;
  }
  function dropPeer(sid) {
    const p = V.peers.get(sid); if (!p) return;
    try { p.pc.close(); } catch {} p.audio?.remove(); p.audio2?.pause(); V.peers.delete(sid); renderStage();
  }
  async function onSignal({ from, uid, data }) {
    if (!V.room) return;
    const p = makePeer(from, uid); const pc = p.pc;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision; if (p.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') { await pc.setLocalDescription(); signal(from, { description: pc.localDescription }); }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!p.ignoreOffer) console.warn(e); }
      }
    } catch (e) { console.warn('signal', e); }
  }
  function addTrackAll(track, stream) { for (const p of V.peers.values()) p.senders.set(track.id, p.pc.addTrack(track, stream)); }
  function removeTrackAll(track) { for (const p of V.peers.values()) { const s = p.senders.get(track.id); if (s) { try { p.pc.removeTrack(s); } catch {} p.senders.delete(track.id); } } }

  // ---------- speaking indicator ----------
  const meters = new Map();
  function watchLevel(uid, stream) {
    try { const c = Z.ac(); const src = c.createMediaStreamSource(stream); const an = c.createAnalyser(); an.fftSize = 512; src.connect(an); meters.set(uid, { an, buf: new Uint8Array(an.fftSize) }); } catch {}
  }
  setInterval(() => {
    for (const [uid, m] of meters) {
      m.an.getByteTimeDomainData(m.buf); let peak = 0; for (const v of m.buf) peak = Math.max(peak, Math.abs(v - 128));
      const talking = peak > 12 && !(uid === S.me?.id && (V.muted || V.deaf));
      document.querySelectorAll(`[data-vuid="${uid}"]`).forEach((el) => el.classList.toggle('speaking', talking));
    }
  }, 150);

  // ---------- join / leave ----------
  async function join(room, name, opts = {}) {
    if (V.room === room) { openStage(); return; }
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) return toast('Your browser does not support calls. Try Chrome or the Zuno app.');
    if (V.room) leave(true);
    toast('Connecting to ' + name + '…');
    try { V.mic = await Promise.race([getMic(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]); }
    catch (e) { V.mic = null; toast('No microphone access, joining to listen only. Allow the mic and rejoin to talk.'); }
    if (!V.ice) V.ice = await api('/ice').catch(() => null);
    V.room = room; V.roomName = name; V.muted = !V.mic; V.deaf = false; V.activity = null;
    if (V.mic) watchLevel(S.me.id, V.mic);
    sock.emit('voice:join', { room }); if (!V.mic) setTimeout(sendState, 300);
    Z.sound('join'); V.stageOpen = true;
    if (opts.video) setTimeout(() => toggleCam(), 300);
    render();
  }
  function leave(silent) {
    if (!V.room) return;
    sock.emit('voice:leave');
    for (const sid of [...V.peers.keys()]) dropPeer(sid);
    for (const s of [V.mic, V.cam, V.screen]) s?.getTracks().forEach((t) => t.stop());
    V.mic = V.cam = V.screen = null; meters.delete(S.me.id); V.room = null; V.activity = null; V.stageOpen = false; ytPlayer = null;
    if (!silent) Z.sound('hangup');
    render();
  }
  function toggleMute() {
    if (V.deaf) return toggleDeaf();
    if (!V.mic) return toast('No microphone. Allow mic access, then leave and rejoin.');
    V.muted = !V.muted; V.mic?.getAudioTracks().forEach((t) => (t.enabled = !V.muted)); Z.sound(V.muted ? 'mute' : 'unmute'); sendState(); render();
  }
  function toggleDeaf() {
    V.deaf = !V.deaf; for (const p of V.peers.values()) { if (p.audio) p.audio.muted = V.deaf; if (p.audio2) p.audio2.muted = V.deaf; }
    V.mic?.getAudioTracks().forEach((t) => (t.enabled = !(V.deaf || V.muted))); Z.sound(V.deaf ? 'deafen' : 'undeafen'); sendState(); render();
  }
  async function toggleCam() {
    if (V.cam) { V.cam.getTracks().forEach((t) => { removeTrackAll(t); t.stop(); }); V.cam = null; }
    else { try { V.cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } }); V.cam.getTracks().forEach((t) => addTrackAll(t, V.cam)); }
      catch { return toast('Camera blocked or not available.'); } }
    sendState(); render();
  }
  async function toggleScreen() {
    if (V.screen) { V.screen.getTracks().forEach((t) => { removeTrackAll(t); t.stop(); }); V.screen = null; sendState(); render(); return; }
    if (!navigator.mediaDevices.getDisplayMedia) return toast('Screen share works on a computer browser (Chrome, Edge, Firefox).');
    try { V.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true }); }
    catch { return; }
    V.screen.getTracks().forEach((t) => { addTrackAll(t, V.screen); t.onended = () => { if (V.screen) toggleScreen(); }; });
    Z.sound('stream'); sendState(); render();
  }

  // ---------- rendering ----------
  function listHtml(room) {
    const r = V.rooms[room]; if (!r?.users.length) return '';
    return `<div class="voice-users">${r.users.map((u) => { const us = user(u.uid);
      return `<div class="voice-user" data-vuid="${u.uid}">${avatar(us, 22)}<span>${esc0(us.display_name)}</span>${u.screen ? '<span class="live">LIVE</span>' : ''}${u.video ? '🎥' : ''}${u.deaf ? '🔇' : u.muted ? '🎙️̸' : ''}</div>`; }).join('')}</div>`;
  }
  function render() {
    const bar = $('#voice-bar');
    if (!V.room) { bar.classList.add('hidden'); bar.innerHTML = ''; }
    else {
      bar.classList.remove('hidden');
      bar.innerHTML = `<div class="vb-top"><div class="vb-status" id="vb-open"><b>🟢 Voice Connected</b><span>${esc0(V.roomName)}</span></div>
        <button id="vb-stage" title="Show call">📺</button><button id="vb-leave" class="danger" title="Disconnect">📵</button></div>
        <div class="vb-btns"><button id="vb-mute" class="${V.muted || V.deaf ? 'off' : ''}" title="Mute">${V.muted || V.deaf ? '🔇' : '🎙️'}</button><button id="vb-deaf" class="${V.deaf ? 'off' : ''}" title="Deafen">${V.deaf ? '🙉' : '🎧'}</button>
        <button id="vb-cam" class="${V.cam ? 'on' : ''}" title="Camera">🎥</button><button id="vb-screen" class="${V.screen ? 'on' : ''}" title="Share screen">🖥️</button></div>`;
      $('#vb-mute').onclick = toggleMute; $('#vb-deaf').onclick = toggleDeaf; $('#vb-cam').onclick = toggleCam; $('#vb-screen').onclick = toggleScreen;
      $('#vb-leave').onclick = () => leave(); $('#vb-stage').onclick = $('#vb-open').onclick = () => openStage();
    }
    renderStage();
    if (S.view?.type === 'server') renderSidebar();
  }
  function openStage() { V.stageOpen = true; renderStage(); }
  function renderStage() {
    const st = $('#call-stage');
    if (!V.room || !V.stageOpen) { st.classList.add('hidden'); st.innerHTML = ''; return; }
    st.classList.remove('hidden');
    const r = V.rooms[V.room] || { users: [] };
    const tiles = [];
    // me
    tiles.push({ uid: S.me.id, me: true, muted: V.muted || V.deaf, deaf: V.deaf, streams: [V.cam, V.screen].filter(Boolean) });
    for (const p of V.peers.values()) { const vs = r.users.find((u) => u.sid === p.sid) || {}; tiles.push({ uid: p.uid, muted: vs.muted, deaf: vs.deaf, streams: [...p.videos.values()] }); }
    const keepAct = V.activity && st.querySelector('.activity')?.dataset.type === V.activity.type;
    const actEl = keepAct ? st.querySelector('.activity') : null;
    st.innerHTML = `<div class="stage-head"><b>${esc0(V.roomName)}</b><span class="muted small">${tiles.length} in call</span><div style="flex:1"></div>
        <button id="st-act" class="btn sm">🎲 Activities</button><button id="st-min" class="btn sm" title="Minimize">▁</button></div>
      <div class="stage-body"><div class="tiles ${V.activity ? 'side' : ''}">${tiles.map((t, i) => `<div class="tile" data-vuid="${t.uid}" data-ti="${i}">${t.streams.length ? '<div class="vids"></div>' : `<div class="tile-av">${avatar(user(t.uid), 72)}</div>`}
        <div class="tile-name">${t.deaf ? '🙉 ' : t.muted ? '🔇 ' : ''}${esc0(user(t.uid).display_name)}${t.me ? ' (you)' : ''}</div></div>`).join('')}</div><div id="act-slot"></div></div>
      <div class="stage-ctrl"><button id="sc-mute" class="${V.muted || V.deaf ? 'off' : ''}">${V.muted || V.deaf ? '🔇' : '🎙️'}</button><button id="sc-deaf" class="${V.deaf ? 'off' : ''}">${V.deaf ? '🙉' : '🎧'}</button>
        <button id="sc-cam" class="${V.cam ? 'on' : ''}">🎥</button><button id="sc-screen" class="${V.screen ? 'on' : ''}">🖥️</button><button id="sc-leave" class="danger">📵</button></div>`;
    tiles.forEach((t, i) => { const box = st.querySelector(`[data-ti="${i}"] .vids`); if (!box) return;
      t.streams.forEach((s) => { const v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = true; v.srcObject = s; v.onclick = () => v.requestFullscreen?.(); box.appendChild(v); }); });
    $('#sc-mute').onclick = toggleMute; $('#sc-deaf').onclick = toggleDeaf; $('#sc-cam').onclick = toggleCam; $('#sc-screen').onclick = toggleScreen; $('#sc-leave').onclick = () => leave();
    $('#st-min').onclick = () => { V.stageOpen = false; renderStage(); };
    $('#st-act').onclick = (e) => menu(e.clientX, e.clientY, [['🖍️ Whiteboard', () => sock.emit('activity:start', { type: 'whiteboard' })], ['📺 Watch Together (YouTube)', () => sock.emit('activity:start', { type: 'watch' })], V.activity && ['⏹ Stop activity', () => sock.emit('activity:stop'), 'danger']]);
    if (V.activity) { if (actEl) $('#act-slot').appendChild(actEl); else renderActivity(); }
  }

  // ---------- activities ----------
  let ytPlayer = null, ytApplying = false, wbCtx = null;
  function renderActivity() {
    const slot = $('#act-slot'); if (!slot || !V.activity) return;
    if (V.activity.type === 'whiteboard') {
      slot.innerHTML = `<div class="activity" data-type="whiteboard"><div class="act-tools">${['#ffffff', '#ed4245', '#f0b232', '#57f287', '#5865f2', '#eb459e', '#000000'].map((c) => `<button class="sw" data-c="${c}" style="background:${c}"></button>`).join('')}
        <input type="range" min="2" max="24" value="4" id="wb-w"><button class="btn sm" id="wb-clear">Clear</button></div><canvas id="wb" width="1280" height="720"></canvas></div>`;
      const cv = $('#wb'); wbCtx = cv.getContext('2d'); let color = '#ffffff', pts = null;
      slot.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => (color = b.dataset.c)));
      $('#wb-clear').onclick = () => { sock.emit('activity:event', { kind: 'clear' }); wbCtx.clearRect(0, 0, 1280, 720); };
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]; };
      cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pts = [pos(e)]; };
      cv.onpointermove = (e) => { if (!pts) return; const p = pos(e); const last = pts[pts.length - 1]; pts.push(p); drawSeg(color, +$('#wb-w').value, [last, p]); };
      cv.onpointerup = cv.onpointercancel = () => { if (pts && pts.length > 1) sock.emit('activity:event', { kind: 'stroke', c: color, w: +$('#wb-w').value, points: pts }); pts = null; };
      (V.activity.strokes || []).forEach((s) => drawSeg(s.c, s.w, s.points));
    } else if (V.activity.type === 'watch') {
      slot.innerHTML = `<div class="activity" data-type="watch"><div class="act-tools"><input id="yt-url" placeholder="Paste a YouTube link"><button class="btn sm primary" id="yt-add">Add to queue</button><button class="btn sm" id="yt-next">Skip ⏭</button></div>
        <div id="yt-wrap"><div id="yt"></div></div><div class="small muted" id="yt-q"></div></div>`;
      $('#yt-add').onclick = () => { const id = ytId($('#yt-url').value); if (!id) return toast('That does not look like a YouTube link'); sock.emit('activity:event', { kind: 'queue', video: id }); $('#yt-url').value = ''; };
      $('#yt-next').onclick = () => sock.emit('activity:event', { kind: 'next', current: V.activity.current });
      ytPlayer = null; loadYT(() => applyWatch());
    }
  }
  function drawSeg(c, w, points) {
    if (!wbCtx || points.length < 2) return; wbCtx.strokeStyle = c; wbCtx.lineWidth = w * 2; wbCtx.lineCap = wbCtx.lineJoin = 'round';
    wbCtx.beginPath(); points.forEach(([x, y], i) => (i ? wbCtx.lineTo(x * 1280, y * 720) : wbCtx.moveTo(x * 1280, y * 720))); wbCtx.stroke();
  }
  const ytId = (u) => (String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(u.trim()) ? u.trim() : null);
  function loadYT(cb) {
    if (window.YT?.Player) return cb();
    window.onYouTubeIframeAPIReady = cb;
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) { const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); }
  }
  function applyWatch() {
    const a = V.activity; if (!a || a.type !== 'watch' || !window.YT?.Player || !$('#yt-wrap')) return;
    $('#yt-q') && ($('#yt-q').textContent = a.current ? `Up next: ${a.queue.length} in queue` : 'Paste a YouTube link to start watching together.');
    const target = a.t + (a.playing ? (Date.now() - a.at) / 1000 : 0);
    if (!a.current) { if (ytPlayer) { ytPlayer.destroy?.(); ytPlayer = null; $('#yt-wrap').innerHTML = '<div id="yt"></div>'; } return; }
    if (!ytPlayer) {
      ytApplying = true;
      ytPlayer = new YT.Player('yt', { videoId: a.current, playerVars: { start: Math.floor(target), autoplay: a.playing ? 1 : 0, playsinline: 1 },
        events: { onReady: () => { setTimeout(() => (ytApplying = false), 800); if (!a.playing) ytPlayer.pauseVideo(); },
          onStateChange: (e) => { if (ytApplying) return;
            if (e.data === YT.PlayerState.PLAYING) sock.emit('activity:event', { kind: 'play', t: ytPlayer.getCurrentTime() });
            if (e.data === YT.PlayerState.PAUSED) sock.emit('activity:event', { kind: 'pause', t: ytPlayer.getCurrentTime() });
            if (e.data === YT.PlayerState.ENDED) sock.emit('activity:event', { kind: 'next', current: a.current }); } } });
      return;
    }
    if (!ytPlayer.getVideoData) return;
    ytApplying = true;
    if (ytPlayer.getVideoData().video_id !== a.current) ytPlayer.loadVideoById(a.current, target);
    else { if (Math.abs(ytPlayer.getCurrentTime() - target) > 2) ytPlayer.seekTo(target, true); a.playing ? ytPlayer.playVideo() : ytPlayer.pauseVideo(); }
    setTimeout(() => (ytApplying = false), 800);
  }

  // ---------- incoming calls ----------
  let ringingDm = null;
  function incoming({ dm_id, from }) {
    if (V.room === 'dm:' + dm_id) return;
    ringingDm = dm_id; Z.ring(true); cacheUser(from);
    const d = S.dms.find((x) => x.id === dm_id);
    const el = document.createElement('div'); el.className = 'incoming'; el.id = 'incoming';
    el.innerHTML = `${avatar(from, 80)}<h3>${esc0(from.display_name)}</h3><p class="muted">${d?.is_group ? 'is calling ' + esc0(dmName(d)) : 'is calling you…'}</p>
      <div class="row" style="justify-content:center;gap:24px"><button class="call-btn decline" id="in-no">📵</button><button class="call-btn accept" id="in-yes">📞</button></div>`;
    $('#incoming')?.remove(); document.body.appendChild(el);
    $('#in-yes').onclick = () => { stopRing(); join('dm:' + dm_id, d ? dmName(d) : from.display_name); if (d) openDm(dm_id); };
    $('#in-no').onclick = () => { sock.emit('call:decline', { dm_id }); stopRing(); };
    if (window.ZunoAndroid?.notify && (document.hidden || !document.hasFocus())) try { ZunoAndroid.notify('📞 ' + from.display_name, 'Incoming call on Zuno'); } catch {}
    setTimeout(() => { if (ringingDm === dm_id) stopRing(); }, 45000);
  }
  function stopRing() { ringingDm = null; Z.ring(false); $('#incoming')?.remove(); }

  // ---------- socket ----------
  function bind(s) {
    sock = s;
    s.on('voice:update', (p) => {
      const before = V.rooms[p.room]?.users.length || 0; V.rooms[p.room] = p;
      if (p.room === V.room) { if (p.users.length > before && before) Z.sound('join'); if (p.users.length < before) Z.sound('leave');
        p.users.forEach((u) => { if (!u.sid) return; if (u.sid !== s.id && !meters.has(u.uid)) {} }); renderStage(); }
      if (S.view?.type === 'server') renderSidebar();
    });
    s.on('voice:peers', ({ room, peers }) => { if (room !== V.room) return; peers.forEach((p) => makePeer(p.sid, p.uid)); });
    s.on('voice:signal', onSignal);
    s.on('voice:left', ({ sid }) => dropPeer(sid));
    s.on('voice:error', (m) => { toast(m); leave(true); });
    s.on('call:ring', incoming);
    s.on('call:stopring', ({ dm_id }) => { if (ringingDm === dm_id) stopRing(); });
    s.on('call:declined', ({ dm_id, uid }) => { if (V.room === 'dm:' + dm_id) toast(user(uid).display_name + ' declined the call'); });
    s.on('activity:state', (a) => { if (a.room !== V.room) return; const prevType = V.activity?.type; V.activity = a.type ? { ...(V.activity || {}), ...a, strokes: a.strokes || V.activity?.strokes || [] } : null;
      if (!a.type || prevType !== a.type) { ytPlayer = null; renderStage(); } else if (a.type === 'watch') applyWatch(); });
    s.on('activity:event', (ev) => { if (ev.room !== V.room || !V.activity) return;
      if (ev.kind === 'stroke') { V.activity.strokes.push(ev); drawSeg(ev.c, ev.w, ev.points); }
      if (ev.kind === 'clear') { V.activity.strokes = []; wbCtx?.clearRect(0, 0, 1280, 720); } });
    s.on('connect', () => { if (V.room) { const r = V.room, n = V.roomName; for (const sid of [...V.peers.keys()]) dropPeer(sid); V.room = null; s.emit('voice:join', { room: r }); V.room = r; V.roomName = n; } });
  }

  // ---------- settings tab ----------
  async function settings(body) {
    const p = micPrefs(); let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch {}
    body.innerHTML = `<label>Microphone<select id="mic-dev"><option value="">Default</option>${devs.map((d, i) => `<option value="${d.deviceId}" ${p.device === d.deviceId ? 'selected' : ''}>${esc0(d.label || 'Microphone ' + (i + 1))}</option>`).join('')}</select></label>
      <label class="switch-row"><span>Noise suppression</span><input type="checkbox" id="mic-noise" ${p.noise !== false ? 'checked' : ''}></label>
      <label class="switch-row"><span>Echo cancellation</span><input type="checkbox" id="mic-echo" ${p.echo !== false ? 'checked' : ''}></label>
      <div class="side-cat" style="padding-left:0">Mic test</div><div class="meter"><div id="mic-lvl"></div></div><button class="btn sm" id="mic-test">🎙️ Let's check</button>
      <p class="small muted">Calls are peer-to-peer. Video and screen share work best with up to 6 people.</p>`;
    const save = () => { localStorage.zunoMic = JSON.stringify({ device: $('#mic-dev').value, noise: $('#mic-noise').checked, echo: $('#mic-echo').checked }); toast('Saved. Rejoin voice to apply.'); };
    $('#mic-dev').onchange = $('#mic-noise').onchange = $('#mic-echo').onchange = save;
    $('#mic-test').onclick = async () => {
      try { const st = await getMic(); const c = Z.ac(); const an = c.createAnalyser(); c.createMediaStreamSource(st).connect(an); const buf = new Uint8Array(256); const end = Date.now() + 8000;
        const tick = () => { an.getByteTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v - 128)); const el = $('#mic-lvl'); if (el) el.style.width = Math.min(100, pk * 1.6) + '%';
          if (Date.now() < end && el) requestAnimationFrame(tick); else st.getTracks().forEach((t) => t.stop()); }; tick(); } catch { toast('Microphone blocked'); }
    };
  }

  return { bind, join, leave, listHtml, settings, get room() { return V.room; }, get deaf() { return V.deaf; }, activityOf: (r) => V.rooms[r]?.activity };
})();
