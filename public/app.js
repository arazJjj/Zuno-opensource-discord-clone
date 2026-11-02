// Zuno client
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.zunoToken, me: null, servers: [], dms: [], friends: [], inventory: [], shop: [], bots: [], reads: {},
  view: { type: 'home', server: null, channel: null, dm: null, homeTab: 'friends' }, messages: [], members: {}, users: {}, typing: {}, replyTo: null, pending: [], gifsEnabled: false };
let socket;

// ---------- api ----------
async function api(path, opts = {}) {
  const o = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { Authorization: 'Bearer ' + S.token } };
  if (opts.body instanceof FormData) o.body = opts.body; else if (opts.body) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch('/api' + path, o); const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logout(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const toast = (t) => { const e = $('#toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.add('hidden'), 2600); };
const tryRun = async (fn) => { try { return await fn(); } catch (e) { toast(e.message); } };

// ---------- auth ----------
function showAuth(mode = 'login') {
  $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden');
  $('#login-form').classList.toggle('hidden', mode !== 'login'); $('#register-form').classList.toggle('hidden', mode !== 'register');
  $('#auth-title').textContent = mode === 'login' ? 'Welcome back!' : 'Create an account';
  $('#auth-sub').textContent = mode === 'login' ? "We're so excited to see you again!" : 'Banners, decorations and name plates are free on Zuno.';
  $('#auth-error').textContent = '';
}
document.addEventListener('click', (e) => { const a = e.target.closest('[data-auth]'); if (a) { e.preventDefault(); showAuth(a.dataset.auth); } });
for (const [fid, path] of [['#login-form', '/login'], ['#register-form', '/register']]) {
  $(fid).addEventListener('submit', async (e) => {
    e.preventDefault(); $('#auth-error').textContent = '';
    try { const j = await api(path, { body: Object.fromEntries(new FormData(e.target)) }); S.token = j.token; localStorage.zunoToken = j.token; start(); }
    catch (er) { $('#auth-error').textContent = er.message; }
  });
}
function logout() { if (S.token) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token } }); localStorage.removeItem('zunoToken'); S.token = null; socket?.disconnect(); showAuth(); }

// ---------- start ----------
async function start() {
  if (!S.token) return showAuth();
  let b; try { b = await api('/bootstrap'); } catch { return showAuth(); }
  Object.assign(S, { me: b.me, servers: b.servers, dms: b.dms, friends: b.friends, inventory: b.inventory, shop: b.shop, bots: b.bots, reads: b.reads, gifsEnabled: b.gifs_enabled, emojis: b.emojis || [] });
  cacheUser(b.me); b.dms.forEach((d) => d.members.forEach(cacheUser)); b.friends.forEach((f) => cacheUser(f.user));
  document.body.classList.toggle('light', S.me.theme === 'light');
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  connect();
  const saved = JSON.parse(localStorage.zunoView || 'null');
  if (saved?.channel && S.servers.find((s) => s.id === saved.server)) openChannel(saved.server, saved.channel);
  else if (saved?.dm && S.dms.find((d) => d.id === saved.dm)) openDm(saved.dm);
  else { const off = S.servers.find((s) => s.is_official); off ? openChannel(off.id, off.channels[0]?.id) : openHome(); }
  renderRail(); renderMe();
  if (sessionStorage.zunoInvite) { const c = sessionStorage.zunoInvite; delete sessionStorage.zunoInvite; tryRun(async () => joined(await api('/invite/' + c, { body: {} }))); }
}
const cacheUser = (u) => { if (u) S.users[u.id] = { ...(S.users[u.id] || {}), ...u }; };

function connect() {
  socket?.disconnect();
  socket = io({ auth: { token: S.token } });
  socket.on('message:new', (m) => {
    cacheUser(m.author);
    if (m.thread_id) { window.ZT?.onMessage(m); if (m.author_id !== S.me.id && mentionsMe(m.content)) { Z.sound('mention'); notify(m); } return; }
    if (m.author_id !== S.me.id && !m.author?.is_bot) { const here0 = (m.channel_id && m.channel_id === S.view.channel) || (m.dm_id && m.dm_id === S.view.dm);
      if (m.dm_id || mentionsMe(m.content)) Z.sound(mentionsMe(m.content) ? 'mention' : 'message'); else if (here0 && document.hasFocus()) Z.sound('soft'); }
    const here = (m.channel_id && m.channel_id === S.view.channel) || (m.dm_id && m.dm_id === S.view.dm);
    if (here) { S.messages.push(m); appendMessage(m); markRead(); delete S.typing[m.author_id]; renderTyping(); }
    else {
      if (m.dm_id) { const d = S.dms.find((x) => x.id === m.dm_id); if (d) d.last_at = m.created_at; }
      if (m.author_id !== S.me.id && (m.dm_id || mentionsMe(m.content))) notify(m);
    }
    if (m.dm_id) { S.dms.sort((a, b) => (b.last_at || 0) - (a.last_at || 0)); }
    S.lastMsg = S.lastMsg || {}; S.lastMsg[m.channel_id || m.dm_id] = m.created_at;
    renderRail(); renderSidebar();
  });
  socket.on('message:update', (m) => { const i = S.messages.findIndex((x) => x.id === m.id); if (i > -1) { S.messages[i] = m; const el = document.querySelector(`[data-mid="${m.id}"]`); if (el) el.replaceWith(msgEl(m, el.classList.contains('first'))); } });
  socket.on('message:delete', ({ id }) => { S.messages = S.messages.filter((m) => m.id !== id); document.querySelector(`[data-mid="${id}"]`)?.remove(); });
  socket.on('typing', (t) => { if ((t.channel_id && t.channel_id === S.view.channel) || (t.dm_id && t.dm_id === S.view.dm)) { S.typing[t.user_id] = { name: t.name, at: Date.now() }; renderTyping(); } });
  socket.on('presence', ({ user_id, online }) => { if (S.users[user_id]) S.users[user_id].online = online; for (const k in S.members) S.members[k].forEach((m) => { if (m.id === user_id) m.online = online; }); renderMembers(); if (S.view.type === 'home') renderSidebar(); });
  socket.on('user:update', (u) => { cacheUser(u); if (u.id === S.me.id) { Object.assign(S.me, u); renderMe(); } for (const k in S.members) S.members[k] = S.members[k].map((m) => (m.id === u.id ? { ...m, ...u } : m)); renderMembers(); });
  socket.on('server:update', (s) => { const i = S.servers.findIndex((x) => x.id === s.id); const role = S.servers[i]?.my_role; if (i > -1) S.servers[i] = { ...s, my_role: role }; renderRail(); renderSidebar(); renderHead(); });
  socket.on('server:delete', ({ id }) => { S.servers = S.servers.filter((s) => s.id !== id); if (S.view.server === id) openHome(); renderRail(); });
  socket.on('member:join', ({ server_id, user }) => { cacheUser(user); if (S.members[server_id] && !S.members[server_id].find((m) => m.id === user.id)) S.members[server_id].push({ ...user, role: 'member' }); renderMembers(); });
  socket.on('member:leave', ({ server_id, user_id }) => { if (S.members[server_id]) S.members[server_id] = S.members[server_id].filter((m) => m.id !== user_id); renderMembers(); });
  socket.on('dm:update', (d) => { if (!d) return; d.members.forEach(cacheUser); const i = S.dms.findIndex((x) => x.id === d.id); if (i > -1) S.dms[i] = d; else S.dms.unshift(d); renderSidebar(); renderRail(); if (S.view.dm === d.id) { renderHead(); renderMembers(); } });
  socket.on('friends:update', (f) => { S.friends = f; f.forEach((x) => cacheUser(x.user)); renderRail(); if (S.view.type === 'home') { renderSidebar(); if (!S.view.dm) renderFriends(); } });
  window.ZV?.bind(socket); window.ZT?.bind(socket);
  socket.on('emojis:changed', async () => { S.emojis = await api('/emojis').catch(() => S.emojis); });
  socket.on('events:changed', ({ server_id }) => { if (S.view.server === server_id) window.ZE?.refresh(); });
  socket.on('connect_error', (e) => { if (e.message === 'unauthorized') logout(); });
}
setInterval(() => { let ch = false; for (const k in S.typing) if (Date.now() - S.typing[k].at > 6000) { delete S.typing[k]; ch = true; } if (ch) renderTyping(); }, 2000);

function notify(m) {
  if (document.hasFocus() && !document.hidden) return;
  if (window.ZunoAndroid?.notify) { try { ZunoAndroid.notify(m.author.display_name, m.content || (m.poll ? 'Poll: ' + m.poll.question : 'Sent an attachment')); } catch {} return; }
  if (Notification?.permission === 'granted') new Notification(m.author.display_name, { body: m.content || 'Sent an attachment', icon: m.author.avatar || '/logo.svg' });
}
const mentionsMe = (t) => new RegExp('@(' + S.me.username + '|everyone)\\b', 'i').test(t || '');

// ---------- render helpers ----------
const initials = (n) => esc((n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
function avatar(u, size = 40, dot = false) {
  u = S.users[u?.id] || u || {};
  const deco = u.decoration ? ' ' + (S.shop.find((s) => s.id === u.decoration)?.css ? 'deco-' + S.shop.find((s) => s.id === u.decoration).css : '') : '';
  const inner = u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : initials(u.display_name);
  return `<span class="av${deco}" style="width:${size}px;height:${size}px;font-size:${size * 0.38}px;background:${esc(u.banner_color || '#7c5cff')}">${inner}${dot ? `<span class="dot ${u.online ? 'on' : ''}"></span>` : ''}</span>`;
}
const frameClass = (u) => { u = S.users[u?.id] || u; const it = S.shop.find((s) => s.id === u?.profile_frame); return it ? ' framed frame-' + it.css : ''; };
const plateClass = (u) => { u = S.users[u?.id] || u; const it = S.shop.find((s) => s.id === u?.nameplate); return it ? ' plate plate-' + it.css : ''; };
const serverIcon = (s, size = 48) => s.icon ? `<img src="${esc(s.icon)}" alt="">` : `<span style="font-size:${size * 0.36}px">${initials(s.name)}</span>`;
function fmtTime(t) { const d = new Date(t), n = new Date(); const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === n.toDateString()) return 'Today at ' + time; const y = new Date(n - 864e5); if (d.toDateString() === y.toDateString()) return 'Yesterday at ' + time; return d.toLocaleDateString() + ' ' + time; }
const dmName = (d) => d.name || d.members.filter((m) => m.id !== S.me.id).map((m) => m.display_name).join(', ') || 'Just you';
const dmOther = (d) => d.members.find((m) => m.id !== S.me.id) || S.me;
function isUnread(target, lastAt) { return lastAt && (!S.reads[target] || S.reads[target] < lastAt); }

function markdown(src) {
  let t = esc(src);
  const blocks = [];
  t = t.replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, c) => { blocks.push('<pre>' + c + '</pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
  t = t.replace(/`([^`\n]+)`/g, (_, c) => { blocks.push('<code>' + c + '</code>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
  t = t.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)@([a-z0-9_.]{2,32}|everyone)\b/gi, (m, sp, u) => `${sp}<span class="mention-pill" data-user="${u.toLowerCase()}">@${u}</span>`);
  t = t.replace(/:([a-z0-9_]{2,32}):/g, (m0, n) => { const e = (S.emojis || []).find((x) => x.name === n && x.kind === 'emoji'); return e ? `<img class="cemoji" src="${esc(e.url)}" alt=":${n}:" title=":${n}:">` : m0; });
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}
const imgUrlRe = /^(https?:\/\/\S+\.(gif|png|jpe?g|webp)(\?\S*)?|https?:\/\/media\d?\.(giphy|tenor)\.com\/\S+)$/i;

// ---------- rail ----------
function renderRail() {
  const dmUnread = S.dms.filter((d) => isUnread(d.id, d.last_at)).length + S.friends.filter((f) => f.status === 'incoming').length;
  $('#home-btn').classList.toggle('active', S.view.type === 'home');
  $('#home-btn').innerHTML = `<img src="/logo.svg" alt="Home">${dmUnread ? `<span class="badge">${dmUnread}</span>` : ''}`;
  $('#server-list').innerHTML = S.servers.map((s) => `<button class="rail-btn ${S.view.server === s.id ? 'active' : ''}" data-server="${s.id}" title="${esc(s.name)}">${serverIcon(s)}</button>`).join('');
}
$('#server-list').addEventListener('click', (e) => { const b = e.target.closest('[data-server]'); if (!b) return; const s = S.servers.find((x) => x.id === b.dataset.server);
  const last = JSON.parse(localStorage['zunoLast_' + s.id] || 'null'); openChannel(s.id, s.channels.find((c) => c.id === last)?.id || s.channels[0]?.id); });
$('#server-list').addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-server]'); if (!b) return; e.preventDefault(); serverMenu(S.servers.find((x) => x.id === b.dataset.server), e.clientX, e.clientY); });
$('#home-btn').onclick = () => openHome();
$('#add-server-btn').onclick = () => addServerModal();
$('#discover-btn').onclick = () => discoverModal();

// ---------- views ----------
function saveView() { localStorage.zunoView = JSON.stringify({ server: S.view.server, channel: S.view.channel, dm: S.view.dm }); }
function closeNav() { document.body.classList.remove('nav-open'); }
function openHome(tab) {
  S.view = { type: 'home', server: null, channel: null, dm: null, homeTab: tab || S.view.homeTab || 'friends' }; saveView();
  renderRail(); renderSidebar(); renderHead(); renderFriends(); $('#composer').classList.add('hidden'); $('#members').innerHTML = ''; $('#typing').innerHTML = '';
}
async function openChannel(sid, cid) {
  if (!cid) return;
  S.view = { type: 'server', server: sid, channel: cid, dm: null }; saveView(); localStorage['zunoLast_' + sid] = JSON.stringify(cid);
  closeNav(); renderRail(); renderSidebar(); renderHead(); $('#composer').classList.remove('hidden'); S.typing = {}; renderTyping(); setPlaceholder();
  await loadMessages(); if (!S.members[sid]) S.members[sid] = await api('/servers/' + sid + '/members').catch(() => []); S.members[sid].forEach(cacheUser); renderMembers();
}
async function openDm(did) {
  S.view = { type: 'home', server: null, channel: null, dm: did, homeTab: S.view.homeTab }; saveView();
  closeNav(); renderRail(); renderSidebar(); renderHead(); $('#composer').classList.remove('hidden'); S.typing = {}; renderTyping(); setPlaceholder();
  await loadMessages(); renderMembers();
}
function setPlaceholder() {
  const ch = curChannel(); const d = S.dms.find((x) => x.id === S.view.dm);
  $('#input').placeholder = ch ? 'Message #' + ch.name : d ? 'Message ' + (d.is_group ? dmName(d) : '@' + dmOther(d).display_name) : 'Message';
  const locked = ch?.type === 'announcement' && !['owner', 'admin'].includes(curServer()?.my_role);
  $('#input').disabled = locked; if (locked) $('#input').placeholder = 'Only admins can post in this channel';
}
const curServer = () => S.servers.find((s) => s.id === S.view.server);
const curChannel = () => curServer()?.channels.find((c) => c.id === S.view.channel);
async function loadMessages() {
  const q = S.view.channel ? 'channel_id=' + S.view.channel : 'dm_id=' + S.view.dm;
  $('#messages').innerHTML = '<p class="muted" style="padding:16px">Loading…</p>';
  S.messages = await api('/messages?' + q).catch(() => []); S.messages.forEach((m) => cacheUser(m.author)); S.hasMore = S.messages.length === 50;
  renderMessages(); markRead();
}
function markRead() { const t = S.view.channel || S.view.dm; if (!t) return; S.reads[t] = Date.now(); api('/read', { body: { target_id: t } }).catch(() => {}); renderRail(); }

// ---------- sidebar ----------
function renderSidebar() {
  const head = $('#side-head'), body = $('#side-body');
  if (S.view.type === 'home') {
    head.innerHTML = `<input id="dm-search" placeholder="Find or start a conversation" style="padding:6px 8px;font-size:13px">`; head.onclick = null;
    $('#dm-search').oninput = (e) => renderDmList(e.target.value.toLowerCase());
    renderDmList('');
  } else {
    const s = curServer(); if (!s) return;
    const admin = ['owner', 'admin'].includes(s.my_role);
    head.innerHTML = `<span>${esc(s.name)}</span><span>⌄</span>`; head.onclick = (e) => serverMenu(s, e.clientX, 52);
    body.innerHTML = (s.banner ? `<div class="server-banner" style="background-image:url('${esc(s.banner)}')"></div>` : '') +
      `<div class="side-item" id="events-btn"><span class="hash">📅</span><span>Events</span></div>` +
      `<div class="side-cat"><span>Text channels</span>${admin ? '<button id="add-ch" title="Create channel">+</button>' : ''}</div>` +
      s.channels.filter((c) => c.type !== 'voice').map((c) => `<div class="side-item ${c.id === S.view.channel ? 'active' : ''} ${c.id !== S.view.channel && isUnread(c.id, S.lastMsg?.[c.id]) ? 'unread' : ''}" data-ch="${c.id}" ${admin ? 'draggable="true"' : ''}>
        <span class="hash">${c.type === 'announcement' ? '📢' : '#'}</span><span>${esc(c.name)}</span>${admin ? `<button class="x" data-edit-ch="${c.id}" title="Edit">⚙</button>` : ''}</div>`).join('') +
      `<div class="side-cat"><span>Voice channels</span>${admin ? '<button id="add-vc" title="Create voice channel">+</button>' : ''}</div>` +
      s.channels.filter((c) => c.type === 'voice').map((c) => `<div class="side-item voice-ch ${window.ZV?.room === 'ch:' + c.id ? 'active' : ''}" data-vc="${c.id}" ${admin ? 'draggable="true"' : ''}>
        <span class="hash">🔊</span><span>${esc(c.name)}</span>${window.ZV?.activityOf('ch:' + c.id) ? '<span class="tag" style="background:var(--green)">LIVE</span>' : ''}${admin ? `<button class="x" data-edit-ch="${c.id}" title="Edit">⚙</button>` : ''}</div>${window.ZV ? ZV.listHtml('ch:' + c.id) : ''}`).join('');
    body.querySelectorAll('[data-ch]').forEach((el) => (el.onclick = (e) => { if (e.target.closest('[data-edit-ch]')) return editChannelModal(s, s.channels.find((c) => c.id === el.dataset.ch)); openChannel(s.id, el.dataset.ch); }));
    body.querySelectorAll('[data-vc]').forEach((el) => (el.onclick = (e) => { if (e.target.closest('[data-edit-ch]')) return editChannelModal(s, s.channels.find((c) => c.id === el.dataset.vc)); window.ZV?.join('ch:' + el.dataset.vc, s.channels.find((c) => c.id === el.dataset.vc).name); }));
    $('#events-btn').onclick = () => window.ZE?.open(s);
    $('#add-vc') && ($('#add-vc').onclick = () => createChannelModal(s, 'voice'));
    if (admin) { let drag = null;
      body.querySelectorAll('[draggable]').forEach((el) => { el.ondragstart = () => { drag = el; el.style.opacity = .4; }; el.ondragend = () => { el.style.opacity = ''; };
        el.ondragover = (e) => { e.preventDefault(); }; el.ondrop = (e) => { e.preventDefault(); if (!drag || drag === el) return;
          const ids = s.channels.map((c) => c.id); const from = ids.indexOf(drag.dataset.ch || drag.dataset.vc); const to = ids.indexOf(el.dataset.ch || el.dataset.vc);
          ids.splice(to, 0, ids.splice(from, 1)[0]); s.channels.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); renderSidebar();
          tryRun(() => api(`/servers/${s.id}/reorder`, { body: { ids } })); }; }); }
    $('#add-ch') && ($('#add-ch').onclick = () => createChannelModal(s));
  }
}
function renderDmList(filter) {
  const pend = S.friends.filter((f) => f.status === 'incoming').length;
  $('#side-body').innerHTML = `
    <div class="side-item ${!S.view.dm && S.view.homeTab !== 'shop' ? 'active' : ''}" data-home="friends"><span class="hash">👥</span><span>Friends</span>${pend ? `<span class="badge">${pend}</span>` : ''}</div>
    <div class="side-item" data-home="shop"><span class="hash">🛍️</span><span>Shop</span><span class="badge" style="background:var(--green)">FREE</span></div>
    <div class="side-item" data-home="bots"><span class="hash">🤖</span><span>My Bots</span></div>
    <div class="side-cat"><span>Direct messages</span><button id="new-dm" title="New DM / group">+</button></div>
    ${S.dms.filter((d) => dmName(d).toLowerCase().includes(filter)).map((d) => { const o = dmOther(d);
      return `<div class="side-item ${d.id === S.view.dm ? 'active' : ''} ${d.id !== S.view.dm && isUnread(d.id, d.last_at) ? 'unread' : ''}${d.is_group ? '' : plateClass(o)}" data-dm="${d.id}">
        ${d.is_group ? `<span class="av" style="width:32px;height:32px;font-size:13px;background:#06b6d4">${d.icon ? `<img src="${esc(d.icon)}">` : '👥'}</span>` : avatar(o, 32, true)}
        <span style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(dmName(d))}</div>
        <div class="small muted">${d.is_group ? d.members.length + ' members' : esc(o.custom_status || '')}</div></span></div>`; }).join('')}`;
  document.querySelectorAll('[data-home]').forEach((el) => (el.onclick = () => { const t = el.dataset.home; if (t === 'shop') return shopModal(); if (t === 'bots') return botsModal(); openHome('friends'); }));
  document.querySelectorAll('[data-dm]').forEach((el) => (el.onclick = () => openDm(el.dataset.dm)));
  $('#new-dm').onclick = () => newDmModal();
}
function renderMe() {
  const u = S.me;
  $('#me-bar').innerHTML = `<div class="who" id="me-who" style="display:flex;gap:8px;align-items:center">${avatar(u, 32, true)}<div style="min-width:0"><b>${esc(u.display_name)}</b><span>${esc(u.custom_status || '@' + u.username)}</span></div></div>
    <button id="shop-btn" title="Shop">🛍️</button><button id="settings-btn" title="Settings">⚙️</button>`;
  $('#me-who').onclick = (e) => profilePopover(u.id, e.clientX, e.clientY - 360);
  $('#settings-btn').onclick = () => settingsModal(); $('#shop-btn').onclick = () => shopModal();
}

// ---------- head ----------
function renderHead() {
  const h = $('#chat-head'); const menu = '<button class="menu-btn" id="menu-btn">☰</button>';
  if (S.view.type === 'home' && !S.view.dm) {
    const tabs = ['online', 'all', 'pending', 'blocked'];
    h.innerHTML = `${menu}<span class="title">👥 Friends</span><div class="tabs" style="margin:0 0 0 12px">${tabs.map((t) => `<button data-ftab="${t}" class="${(S.fTab || 'online') === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}<button class="btn green sm" data-ftab="add">Add Friend</button></div>`;
    h.querySelectorAll('[data-ftab]').forEach((b) => (b.onclick = () => { S.fTab = b.dataset.ftab; renderHead(); renderFriends(); }));
  } else if (S.view.dm) {
    const d = S.dms.find((x) => x.id === S.view.dm); if (!d) return;
    h.innerHTML = `${menu}${d.is_group ? '👥' : avatar(dmOther(d), 24, true)}<span class="title">${esc(dmName(d))}</span>
      <div class="tools"><button id="call-btn" title="Voice call">📞</button><button id="vcall-btn" title="Video call">🎥</button>${d.is_group ? '<button id="grp-edit" title="Group settings">✏️</button><button id="grp-add" title="Add people">➕</button>' : ''}<button id="pins-btn" title="Pinned">📌</button><button id="search-btn" title="Search">🔍</button><button id="mem-toggle" title="Members">👥</button></div>`;
    $('#call-btn').onclick = () => window.ZV?.join('dm:' + d.id, dmName(d));
    $('#vcall-btn').onclick = () => window.ZV?.join('dm:' + d.id, dmName(d), { video: true });
    $('#grp-edit') && ($('#grp-edit').onclick = () => groupEditModal(d)); $('#grp-add') && ($('#grp-add').onclick = () => newDmModal(d));
  } else {
    const c = curChannel(); if (!c) return;
    h.innerHTML = `${menu}<span class="title">${c.type === 'announcement' ? '📢' : '#'} ${esc(c.name)}</span><span class="topic">${esc(c.topic || '')}</span>
      <div class="tools"><button id="invite-btn" title="Invite">📨</button><button id="pins-btn" title="Pinned">📌</button><button id="search-btn" title="Search">🔍</button><button id="mem-toggle" title="Members">👥</button></div>`;
    $('#invite-btn').onclick = () => inviteModal(curServer());
  }
  $('#menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  $('#pins-btn') && ($('#pins-btn').onclick = () => pinsModal()); $('#search-btn') && ($('#search-btn').onclick = () => searchModal());
  $('#mem-toggle') && ($('#mem-toggle').onclick = () => { const m = $('#members'); if (innerWidth <= 820) m.classList.toggle('open'); else m.classList.toggle('hidden'); });
}
document.addEventListener('click', (e) => { if (document.body.classList.contains('nav-open') && !e.target.closest('.rail,.sidebar,#menu-btn')) closeNav(); });

// ---------- friends page ----------
function renderFriends() {
  $('#composer').classList.add('hidden');
  const tab = S.fTab || 'online'; const box = $('#messages');
  if (tab === 'add') {
    box.innerHTML = `<div class="welcome"><h2>Add Friend</h2><p class="muted">Add friends with their Zuno username.</p>
      <form id="add-friend" style="display:flex;gap:8px;max-width:560px"><input name="username" placeholder="Enter a username" required><button class="btn primary">Send Request</button></form></div>`;
    $('#add-friend').onsubmit = (e) => { e.preventDefault(); tryRun(async () => { await api('/friends', { body: { username: e.target.username.value } }); toast('Friend request sent!'); e.target.reset(); }); };
    return;
  }
  const list = S.friends.filter((f) => tab === 'all' ? f.status === 'friend' : tab === 'online' ? f.status === 'friend' && (S.users[f.user.id]?.online) : tab === 'pending' ? ['incoming', 'outgoing'].includes(f.status) : f.status === 'blocked');
  box.innerHTML = `<div style="padding:16px"><div class="side-cat">${tab} — ${list.length}</div>${list.map((f) => `<div class="friend-row" data-uid="${f.user.id}">${avatar(f.user, 36, true)}
    <div class="grow"><b>${esc(f.user.display_name)}</b> <span class="muted small">@${esc(f.user.username)}</span><div class="small muted">${f.status === 'incoming' ? 'Incoming request' : f.status === 'outgoing' ? 'Outgoing request' : esc(f.user.custom_status || (S.users[f.user.id]?.online ? 'Online' : 'Offline'))}</div></div>
    ${f.status === 'friend' ? `<button class="btn sm" data-fa="msg">💬</button><button class="btn sm" data-fa="remove">✕</button>` : ''}
    ${f.status === 'incoming' ? `<button class="btn green sm" data-fa="accept">✓</button><button class="btn sm" data-fa="decline">✕</button>` : ''}
    ${f.status === 'outgoing' ? `<button class="btn sm" data-fa="decline">Cancel</button>` : ''}${f.status === 'blocked' ? `<button class="btn sm" data-fa="unblock">Unblock</button>` : ''}</div>`).join('') ||
    `<div class="welcome" style="text-align:center"><img src="/logo.svg" width="96"><p class="muted">${tab === 'online' ? "No one's around to play with Wumpus... just kidding, there's no Wumpus here. Add some friends!" : 'Nothing here yet.'}</p></div>`}</div>`;
  box.querySelectorAll('[data-fa]').forEach((b) => (b.onclick = () => tryRun(async () => { const uid = b.closest('[data-uid]').dataset.uid; if (b.dataset.fa === 'msg') return startDm(uid); await api(`/friends/${uid}/${b.dataset.fa}`, { body: {} }); })));
}
async function startDm(uid) { const d = await api('/dms', { body: { user_ids: [uid] } }); if (!d?.id) return toast('Could not open that DM'); if (!S.dms.find((x) => x.id === d.id)) S.dms.unshift(d); (d.members || []).forEach(cacheUser); closeModal(); hidePop(); openDm(d.id); }

// ---------- messages ----------
function renderMessages() {
  const box = $('#messages'); const ch = curChannel(); const d = S.dms.find((x) => x.id === S.view.dm);
  let head = '';
  if (ch) head = `<div class="welcome"><div class="av" style="width:68px;height:68px;font-size:34px;background:var(--bg3)">#</div><h2>Welcome to #${esc(ch.name)}!</h2><p class="muted">This is the start of the #${esc(ch.name)} channel.</p></div>`;
  else if (d) head = `<div class="welcome">${d.is_group ? '<div class="av" style="width:80px;height:80px;font-size:36px;background:#06b6d4">👥</div>' : avatar(dmOther(d), 80)}<h2>${esc(dmName(d))}</h2><p class="muted">This is the beginning of your ${d.is_group ? 'group' : 'direct message history with <b>' + esc(dmOther(d).display_name) + '</b>'}.</p></div>`;
  box.innerHTML = (S.hasMore ? '<div style="text-align:center;padding:8px"><button class="btn sm" id="load-more">Load older messages</button></div>' : head);
  let prev = null; for (const m of S.messages) { box.appendChild(groupedEl(m, prev)); prev = m; }
  $('#load-more') && ($('#load-more').onclick = loadOlder);
  box.scrollTop = box.scrollHeight;
  box.querySelectorAll('img').forEach((i) => i.addEventListener('load', () => { if (S.stick !== false) box.scrollTop = box.scrollHeight; }, { once: true }));
}
async function loadOlder() {
  const q = (S.view.channel ? 'channel_id=' + S.view.channel : 'dm_id=' + S.view.dm) + '&before=' + S.messages[0].created_at;
  const older = await api('/messages?' + q); S.hasMore = older.length === 50; older.forEach((m) => cacheUser(m.author));
  const box = $('#messages'); const h = box.scrollHeight; S.messages = older.concat(S.messages); renderMessages(); box.scrollTop = box.scrollHeight - h;
}
$('#messages').addEventListener('scroll', (e) => { const b = e.target; S.stick = b.scrollHeight - b.scrollTop - b.clientHeight < 80; });
function groupedEl(m, prev) {
  const frag = document.createDocumentFragment();
  if (!prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()) { const s = document.createElement('div'); s.className = 'day-sep'; s.textContent = new Date(m.created_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); frag.appendChild(s); prev = null; }
  const first = !prev || prev.author_id !== m.author_id || m.created_at - prev.created_at > 7 * 60e3 || m.reply_to;
  frag.appendChild(msgEl(m, first)); return frag;
}
function appendMessage(m) { const box = $('#messages'); const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || m.author_id === S.me.id;
  box.appendChild(groupedEl(m, S.messages[S.messages.length - 2])); if (stick) { box.scrollTop = box.scrollHeight; box.querySelectorAll('img').forEach((i) => i.addEventListener('load', () => (box.scrollTop = box.scrollHeight), { once: true })); } }
function msgEl(m, first) {
  const el = document.createElement('div'); const a = S.users[m.author_id] || m.author || {};
  el.className = 'msg' + (first ? ' first' : '') + (mentionsMe(m.content) && m.author_id !== S.me.id ? ' mention' : ''); el.dataset.mid = m.id;
  let content = m.content || ''; const atts = [...m.attachments];
  if (imgUrlRe.test(content.trim()) && !atts.length) { atts.push({ url: content.trim(), type: 'image/gif', gif: true }); content = ''; }
  const role = S.view.server && S.members[S.view.server]?.find((x) => x.id === m.author_id)?.role;
  el.innerHTML = `${first ? `<div style="cursor:pointer" data-prof="${a.id}">${avatar(a, 40)}</div>` : `<div class="gutter">${new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>`}
    <div class="body">${m.reply ? `<div class="reply-ref" data-jump="${m.reply.id}">${avatar(m.reply.author, 16)}<b>${esc(m.reply.author?.display_name)}</b> <span>${esc(m.reply.content || 'Attachment')}</span></div>` : ''}
    ${first ? `<div class="meta"><span class="name${a.name_font ? ' font-' + esc(a.name_font) : ''}" data-prof="${a.id}" style="${role === 'owner' ? 'color:#f0b232' : role === 'admin' ? 'color:#eb459e' : ''}">${esc(a.display_name)}</span>${a.is_bot ? '<span class="tag">BOT</span>' : ''}${role === 'owner' ? ' 👑' : ''}<span class="time">${fmtTime(m.created_at)}</span>${m.pinned ? '<span title="Pinned">📌</span>' : ''}</div>` : ''}
    ${content ? `<div class="text">${markdown(content)}${m.edited_at ? ' <span class="edited">(edited)</span>' : ''}</div>` : ''}
    ${m.poll ? pollHtml(m) : ''}
    ${atts.length ? `<div class="attach">${atts.map((x) => x.sticker ? `<img class="sticker" src="${esc(x.url)}" alt="${esc(x.name || 'sticker')}">` : x.type?.startsWith('image') || x.gif ? `<img src="${esc(x.url)}" alt="${esc(x.name || 'image')}" data-light loading="lazy">` :
      x.type?.startsWith('video') ? `<video src="${esc(x.url)}" controls preload="metadata"></video>` : x.type?.startsWith('audio') ? `<audio src="${esc(x.url)}" controls></audio>` :
      `<a class="file" href="${esc(x.url)}" target="_blank" download>📄 <span>${esc(x.name)}</span></a>`).join('')}</div>` : ''}
    ${m.reactions.length ? `<div class="reacts">${m.reactions.map((r) => `<button class="react ${r.users.includes(S.me.id) ? 'mine' : ''}" data-react="${esc(r.emoji)}" title="${esc(r.users.map((u) => S.users[u]?.display_name || 'someone').join(', '))}">${esc(r.emoji)} ${r.users.length}</button>`).join('')}</div>` : ''}
    ${m.thread_count ? `<button class="thread-link" data-t="thread">🧵 ${m.thread_count} ${m.thread_count === 1 ? 'reply' : 'replies'} ›</button>` : ''}</div>
    <div class="msg-tools"><button data-t="react" title="Add reaction">😀</button><button data-t="reply" title="Reply">↩️</button>${m.thread_id ? '' : '<button data-t="thread" title="Thread">🧵</button>'}${m.author_id === S.me.id ? '<button data-t="edit" title="Edit">✏️</button>' : ''}<button data-t="more" title="More">⋯</button></div>`;
  return el;
}
$('#messages').addEventListener('click', (e) => {
  const mEl = e.target.closest('[data-mid]'); const m = mEl && S.messages.find((x) => x.id === mEl.dataset.mid);
  const prof = e.target.closest('[data-prof]'); if (prof) return profilePopover(prof.dataset.prof, e.clientX, e.clientY);
  const men = e.target.closest('.mention-pill'); if (men) { const u = Object.values(S.users).find((x) => x.username === men.dataset.user); if (u) profilePopover(u.id, e.clientX, e.clientY); return; }
  if (e.target.classList.contains('spoiler')) return e.target.classList.toggle('shown');
  if (e.target.matches('[data-light]')) return lightbox(e.target.src);
  const j = e.target.closest('[data-jump]'); if (j) { const t = document.querySelector(`[data-mid="${j.dataset.jump}"]`); if (t) { t.scrollIntoView({ block: 'center' }); t.style.background = '#7c5cff33'; setTimeout(() => (t.style.background = ''), 1500); } return; }
  const r = e.target.closest('[data-react]'); if (r && m) return tryRun(() => api(`/messages/${m.id}/react`, { body: { emoji: r.dataset.react } }));
  const t = e.target.closest('[data-t]'); if (!t || !m) return;
  if (t.dataset.t === 'react') emojiPicker(e.clientX, e.clientY, (em) => tryRun(() => api(`/messages/${m.id}/react`, { body: { emoji: em } })));
  if (t.dataset.t === 'reply') setReply(m);
  if (t.dataset.t === 'edit') editMessage(m);
  if (t.dataset.t === 'more') messageMenu(m, e.clientX, e.clientY);
  if (t.dataset.t === 'thread') window.ZT?.open(m);
});
$('#messages').addEventListener('click', (e) => { const v = e.target.closest('[data-vote]'); if (!v) return; const mEl = v.closest('[data-mid]');
  tryRun(() => api(`/messages/${mEl.dataset.mid}/vote`, { body: { option: +v.dataset.vote } })); }, true);
function pollHtml(m) {
  const p = m.poll; const tot = p.total || 0;
  return `<div class="poll"><div class="poll-q">📊 ${esc(p.question)}</div>${p.options.map((o, i) => { const n = p.votes[i].length; const pct = tot ? Math.round(n * 100 / tot) : 0; const mine = p.votes[i].includes(S.me.id);
    return `<button class="poll-opt ${mine ? 'mine' : ''}" data-vote="${i}"><span class="bar" style="width:${pct}%"></span><span class="lbl">${mine ? '✅ ' : ''}${esc(o)}</span><span class="pct">${n} · ${pct}%</span></button>`; }).join('')}
    <div class="small muted">${tot} ${tot === 1 ? 'vote' : 'votes'}${p.multi ? ' · pick as many as you like' : ''}</div></div>`;
}
function messageMenu(m, x, y) {
  const s = curServer(); const mod = s && ['owner', 'admin'].includes(s.my_role); const mine = m.author_id === S.me.id;
  menu(x, y, [['↩️ Reply', () => setReply(m)], mine && ['✏️ Edit', () => editMessage(m)], ['📋 Copy text', () => navigator.clipboard?.writeText(m.content)],
    (mod || S.view.dm) && [m.pinned ? '📌 Unpin' : '📌 Pin', () => tryRun(() => api('/messages/' + m.id, { method: 'PATCH', body: { pinned: !m.pinned } }))],
    ['🔗 Copy ID', () => navigator.clipboard?.writeText(m.id)], (mine || mod) && ['🗑️ Delete', () => confirm('Delete this message?') && tryRun(() => api('/messages/' + m.id, { method: 'DELETE' })), 'danger']]);
}
function editMessage(m) {
  const row = document.querySelector(`#messages [data-mid="${m.id}"]`) || document.querySelector(`[data-mid="${m.id}"]`); if (!row || row.querySelector('.edit-box')) return;
  const el = row.querySelector('.body'); const old = el.querySelector('.text');
  const box = document.createElement('div'); box.className = 'edit-box';
  box.innerHTML = `<textarea rows="2" style="margin-top:4px;width:100%"></textarea><div class="small muted" style="display:flex;gap:10px;align-items:center;margin-top:4px">escape to <a href="#" data-ed="cancel">cancel</a> • enter to <a href="#" data-ed="save">save</a></div>`;
  const ta = box.querySelector('textarea'); ta.value = m.content;
  if (old) { old.style.display = 'none'; old.after(box); } else el.appendChild(box);
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  const done = () => { box.remove(); if (old) old.style.display = ''; };
  const save = () => { const v = ta.value.trim(); if (!v || v === m.content) return done(); tryRun(async () => { await api('/messages/' + m.id, { method: 'PATCH', body: { content: v } }); done(); }); };
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); done(); } else if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); } });
  box.querySelector('[data-ed="cancel"]').onclick = (e) => { e.preventDefault(); done(); };
  box.querySelector('[data-ed="save"]').onclick = (e) => { e.preventDefault(); save(); };
}
function setReply(m) { S.replyTo = m; const b = $('#reply-bar'); b.classList.remove('hidden'); b.innerHTML = `<span>Replying to <b>${esc(m.author.display_name)}</b></span><button id="cancel-reply">✕</button>`; $('#cancel-reply').onclick = clearReply; $('#input').focus(); }
function clearReply() { S.replyTo = null; $('#reply-bar').classList.add('hidden'); }
function renderTyping() { const names = Object.values(S.typing).map((t) => t.name); $('#typing').innerHTML = names.length ? `<b>${esc(names.slice(0, 3).join(', '))}</b> ${names.length > 1 ? 'are' : 'is'} typing…` : ''; }

// ---------- composer ----------
const input = $('#input');
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  if (!S._typingAt || Date.now() - S._typingAt > 3000) { S._typingAt = Date.now(); socket?.emit('typing', { channel_id: S.view.channel, dm_id: S.view.dm }); } mentionSuggest(); });
input.addEventListener('keydown', (e) => {
  const pop = $('#popover'); if (!pop.classList.contains('hidden') && pop.dataset.kind === 'mention' && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pop.querySelector('button')?.click(); return; }
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); send(); }
  if (e.key === 'ArrowUp' && !input.value) { const mine = [...S.messages].reverse().find((m) => m.author_id === S.me.id); if (mine) { e.preventDefault(); editMessage(mine); } }
  if (e.key === 'Escape') clearReply();
});
input.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } });
$('#send-btn').onclick = () => send();
$('#plus-btn').onclick = (e) => { e.stopPropagation(); menu(e.clientX, e.clientY - 200, [['📎 Upload a file', () => $('#file-input').click()], ['📊 Create a poll', () => pollModal()], ['🎟️ Send a sticker', () => stickerPicker(e.clientX, e.clientY)]]); };
function pollModal() {
  const m = modal(`<h2>📊 Create a poll</h2><form id="pl"><label>Question<input name="q" required maxlength="300" placeholder="What should we play tonight?"></label><div id="pl-opts"></div>
    <button type="button" class="btn sm" id="pl-add">+ Add answer</button><label style="flex-direction:row;align-items:center;gap:8px;display:flex;margin-top:10px"><input type="checkbox" name="multi" style="width:auto"> Allow multiple answers</label><div class="row"><button class="btn primary">Post poll</button></div></form>`);
  const add = () => { if ($('#pl-opts', m).children.length >= 10) return; const i = document.createElement('input'); i.placeholder = 'Answer ' + ($('#pl-opts', m).children.length + 1); i.maxLength = 100; i.style.marginTop = '6px'; $('#pl-opts', m).appendChild(i); };
  add(); add(); $('#pl-add', m).onclick = add;
  $('#pl', m).onsubmit = (e) => { e.preventDefault(); const options = [...$('#pl-opts', m).querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
    tryRun(async () => { await api('/messages', { body: { poll: { question: e.target.q.value, options, multi: e.target.multi.checked }, channel_id: S.view.channel, dm_id: S.view.dm } }); closeModal(); }); };
}
function stickerPicker(x, y, cb) {
  const st = (S.emojis || []).filter((e) => e.kind === 'sticker');
  showPop(`<div class="sticker-grid">${st.map((e) => `<button data-st="${e.id}" title="${esc(e.name)}"><img src="${esc(e.url)}"></button>`).join('')}</div>`, x - 290, y - 340, 'emoji');
  $('#popover').querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const e = st.find((s0) => s0.id === b.dataset.st); hidePop();
    const att = [{ url: e.url, name: e.name, type: 'image/sticker', sticker: true }]; if (cb) cb(att); else send({ attachments: att }); }));
}
$('#file-input').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
$('#chat').addEventListener('dragover', (e) => e.preventDefault()); $('#chat').addEventListener('drop', (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
function addFiles(files) { for (const f of files.slice(0, 10)) S.pending.push({ file: f, url: URL.createObjectURL(f) }); renderPending(); }
function renderPending() { $('#upload-preview').innerHTML = S.pending.map((p, i) => `<div class="up">${p.file.type.startsWith('image') ? `<img src="${p.url}">` : '📄'}<div>${esc(p.file.name.slice(0, 24))}</div><button data-rm="${i}">✕</button></div>`).join('');
  $('#upload-preview').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { S.pending.splice(+b.dataset.rm, 1); renderPending(); })); }
async function send(extra = {}) {
  const content = input.value.trim(); if (!content && !S.pending.length && !extra.attachments) return;
  let attachments = extra.attachments || [];
  if (S.pending.length) { const fd = new FormData(); S.pending.forEach((p) => fd.append('files', p.file)); toast('Uploading…');
    const up = await tryRun(() => api('/upload', { body: fd })); if (!up) return; attachments = attachments.concat(up); S.pending = []; renderPending(); }
  const body = { content: extra.attachments ? '' : content, attachments, reply_to: S.replyTo?.id, channel_id: S.view.channel, dm_id: S.view.dm };
  if (!extra.attachments) { input.value = ''; input.style.height = 'auto'; }
  clearReply(); await tryRun(() => api('/messages', { body }));
}
function mentionSuggest() {
  const m = input.value.slice(0, input.selectionStart).match(/@([a-z0-9_.]*)$/i); if (!m) { if ($('#popover').dataset.kind === 'mention') hidePop(); return; }
  const pool = S.view.server ? S.members[S.view.server] || [] : S.dms.find((d) => d.id === S.view.dm)?.members || [];
  const list = pool.filter((u) => u.username.startsWith(m[1].toLowerCase()) || u.display_name.toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 8);
  if (S.view.server && 'everyone'.startsWith(m[1].toLowerCase())) list.push({ username: 'everyone', display_name: 'Everyone' });
  if (!list.length) return hidePop();
  const r = input.getBoundingClientRect();
  showPop(`<div class="ctx">${list.map((u) => `<button data-u="${esc(u.username)}">${u.id ? avatar(u, 20) : '📣'} ${esc(u.display_name)} <span class="muted small">@${esc(u.username)}</span></button>`).join('')}</div>`, r.left, r.top - 8 - Math.min(list.length * 40, 320), 'mention');
  $('#popover').querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { const pos = input.selectionStart; const before = input.value.slice(0, pos).replace(/@[a-z0-9_.]*$/i, '@' + b.dataset.u + ' '); input.value = before + input.value.slice(pos); input.focus(); hidePop(); }));
}

// ---------- emoji / gif pickers ----------
const EMOJI = '😀 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😏 😢 😭 😡 🤯 😱 🤔 🙄 😴 🤤 🤡 💀 👻 👽 🤖 💩 👍 👎 👏 🙌 🙏 💪 👀 🫡 🤝 ✌️ 👋 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 🔥 ✨ ⭐ 🎉 🎊 🎁 🏆 ⚽ 🎮 🎧 🎵 📸 💻 📱 ☕ 🍕 🍔 🍟 🌮 🍩 🍪 🍿 🥤 🐶 🐱 🐸 🦊 🐼 🐵 🦄 🐍 🌈 ☀️ 🌙 ⚡ ❄️ 🌸 🍀 ✅ ❌ ❓ ❗ 💬 🗿 🇮🇷'.split(' ');
function emojiPicker(x, y, cb) {
  const custom = (S.emojis || []).filter((e) => e.kind === 'emoji');
  showPop(`<div class="emoji-grid">${custom.map((e) => `<button data-ce=":${esc(e.name)}:" title=":${esc(e.name)}:"><img class="cemoji" src="${esc(e.url)}"></button>`).join('')}${EMOJI.map((e) => `<button>${e}</button>`).join('')}</div>`, x - 290, y - 320, 'emoji');
  $('#popover').querySelectorAll('button').forEach((b) => (b.onclick = () => { cb(b.dataset.ce || b.textContent); hidePop(); }));
}
$('#emoji-btn').onclick = (e) => { e.stopPropagation(); emojiPicker(e.clientX, e.clientY, (em) => { input.value += em; input.focus(); }); };
$('#gif-btn').onclick = (e) => { e.stopPropagation(); gifPicker(e.clientX, e.clientY); };
async function gifPicker(x, y) {
  showPop(`<div class="gif-panel"><input id="gif-q" placeholder="Search GIFs"><div class="tabs" style="margin:6px 0"><button id="gif-paste" class="btn sm">Paste a GIF link</button><label class="btn sm">Upload GIF<input type="file" accept="image/gif,image/*" hidden id="gif-up"></label></div><div class="gif-grid" id="gif-grid"><p class="muted">Loading…</p></div></div>`, Math.max(8, x - 420), Math.max(8, y - 520), 'gif');
  const load = async (q) => {
    const list = await api('/gifs?q=' + encodeURIComponent(q || '')).catch(() => []);
    $('#gif-grid').innerHTML = list.length ? list.map((g) => `<img src="${esc(g.preview || g.url)}" data-full="${esc(g.url)}" title="${esc(g.title || '')}" loading="lazy">`).join('')
      : `<p class="muted small">${S.gifsEnabled ? 'No GIFs found.' : 'GIF search turns on when the server owner adds a free TENOR_API_KEY or GIPHY_API_KEY. You can still paste any GIF link or upload a GIF.'}</p>`;
    $('#gif-grid').querySelectorAll('img').forEach((i) => (i.onclick = () => { hidePop(); send({ attachments: [{ url: i.dataset.full, type: 'image/gif', gif: true, name: 'GIF' }] }); }));
  };
  let t; $('#gif-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 350); }; $('#gif-q').focus(); load('');
  $('#gif-paste').onclick = () => { const u = prompt('GIF link (giphy, tenor, or any .gif URL):'); if (u && /^https?:\/\//.test(u)) { hidePop(); send({ attachments: [{ url: u.trim(), type: 'image/gif', gif: true, name: 'GIF' }] }); } };
  $('#gif-up').onchange = (e) => { hidePop(); addFiles([...e.target.files]); send(); };
}

// ---------- popover/menus/modals ----------
function showPop(html, x, y, kind = '') { const p = $('#popover'); p.innerHTML = html; p.dataset.kind = kind; p.classList.remove('hidden');
  const w = p.offsetWidth, h = p.offsetHeight; p.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px'; }
function hidePop() { const p = $('#popover'); p.classList.add('hidden'); p.dataset.kind = ''; }
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#popover') && !e.target.closest('#emoji-btn,#gif-btn')) hidePop(); });
function menu(x, y, items) { items = items.filter(Boolean); showPop(`<div class="ctx">${items.map((it, i) => `<button data-i="${i}" class="${it[2] || ''}">${it[0]}</button>`).join('')}</div>`, x, y, 'menu');
  $('#popover').querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { hidePop(); items[+b.dataset.i][1](); })); }
function modal(html, cls = '') { closeModal(); const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal ${cls}"><button class="x" data-close>✕</button>${html}</div>`;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); }); $('#modal-root').appendChild(bg); return bg.querySelector('.modal'); }
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); hidePop(); } });
function lightbox(src) { const l = document.createElement('div'); l.className = 'lightbox'; l.innerHTML = `<img src="${esc(src)}"><a href="${esc(src)}" target="_blank" style="position:absolute;bottom:16px">Open original</a>`; l.onclick = () => l.remove(); document.body.appendChild(l); }
async function uploadOne(file) { const fd = new FormData(); fd.append('files', file); return (await api('/upload', { body: fd }))[0].url; }

async function profilePopover(uid, x, y) {
  const u = await api('/users/' + uid).catch(() => null); if (!u) return; cacheUser(u);
  const me = u.id === S.me.id; const fr = S.friends.find((f) => f.user.id === u.id);
  showPop(`<div class="profile-card${frameClass(u)}"><div class="banner" style="background:${u.banner ? `url('${esc(u.banner)}') center/cover` : esc(u.banner_color)}"></div>
    <div class="pc-body">${avatar(u, 88, true)}<div class="pc-inner${plateClass(u)}"><h3 class="${u.name_font ? 'font-' + esc(u.name_font) : ''}">${esc(u.display_name)} ${u.is_bot ? '<span class="tag">BOT</span>' : ''}</h3><div class="muted">@${esc(u.username)}${u.pronouns ? ' • ' + esc(u.pronouns) : ''}</div>
    ${u.custom_status ? `<div style="margin-top:6px">${esc(u.custom_status)}</div>` : ''}
    ${u.bio ? `<div class="side-cat" style="padding-left:0">About me</div><div class="small" style="white-space:pre-wrap">${markdown(u.bio)}</div>` : ''}
    ${u.connections?.length ? `<div class="side-cat" style="padding-left:0">Connections</div><div class="conns">${u.connections.map((c) => `<span class="conn">${CONN_ICONS[c.type] || '🔗'} ${esc(c.name)}</span>`).join('')}</div>` : ''}
    <div class="side-cat" style="padding-left:0">Member since</div><div class="small">${new Date(u.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</div>
    ${u.mutual_servers?.length && !me ? `<div class="side-cat" style="padding-left:0">Mutual servers — ${u.mutual_servers.length}</div>` : ''}</div>
    <div class="row" style="justify-content:flex-start">${me ? '<button class="btn primary sm" id="pp-edit">Edit Profile</button>' :
      `<button class="btn primary sm" id="pp-msg">Message</button>${u.is_bot ? '' : !fr ? '<button class="btn green sm" id="pp-add">Add Friend</button>' : fr.status === 'incoming' ? '<button class="btn green sm" id="pp-acc">Accept</button>' : ''}${u.is_bot ? '' : '<button class="btn sm" id="pp-block">Block</button>'}`}</div></div></div>`, x, y, 'profile');
  $('#pp-edit') && ($('#pp-edit').onclick = () => { hidePop(); settingsModal('profile'); });
  $('#pp-msg') && ($('#pp-msg').onclick = () => tryRun(() => startDm(u.id)));
  $('#pp-add') && ($('#pp-add').onclick = () => tryRun(async () => { await api('/friends', { body: { username: u.username } }); toast('Friend request sent!'); hidePop(); }));
  $('#pp-acc') && ($('#pp-acc').onclick = () => tryRun(async () => { await api(`/friends/${u.id}/accept`, { body: {} }); hidePop(); }));
  $('#pp-block') && ($('#pp-block').onclick = () => confirm('Block ' + u.display_name + '?') && tryRun(async () => { await api(`/friends/${u.id}/block`, { body: {} }); hidePop(); toast('Blocked'); }));
}

// members panel
function renderMembers() {
  const box = $('#members');
  if (S.view.dm) { const d = S.dms.find((x) => x.id === S.view.dm); if (!d) return; box.innerHTML = `<h4>Members — ${d.members.length}</h4>` + d.members.map(memberRow).join(''); return; }
  if (!S.view.server) { box.innerHTML = ''; return; }
  const ms = (S.members[S.view.server] || []).map((m) => ({ ...m, online: S.users[m.id]?.online ?? m.online }));
  const groups = [['Owner', ms.filter((m) => m.role === 'owner')], ['Admins', ms.filter((m) => m.role === 'admin')], ['Bots', ms.filter((m) => m.is_bot && m.role !== 'owner')],
    ['Online', ms.filter((m) => m.role === 'member' && !m.is_bot && m.online)], ['Offline', ms.filter((m) => m.role === 'member' && !m.is_bot && !m.online)]];
  box.innerHTML = groups.filter((g) => g[1].length).map(([t, l]) => `<h4>${t} — ${l.length}</h4>` + l.map(memberRow).join('')).join('');
}
function memberRow(m) { const u = S.users[m.id] || m; return `<div class="member ${u.online || u.is_bot ? '' : 'off'}${plateClass(u)}" data-member="${m.id}">${avatar(u, 32, true)}<div style="min-width:0"><div>${esc(u.display_name)} ${u.is_bot ? '<span class="tag">BOT</span>' : ''}</div><div class="st">${esc(u.custom_status || '')}</div></div></div>`; }
$('#members').addEventListener('click', (e) => { const r = e.target.closest('[data-member]'); if (r) profilePopover(r.dataset.member, e.clientX - 360, e.clientY); });
$('#members').addEventListener('contextmenu', (e) => {
  const r = e.target.closest('[data-member]'); const s = curServer(); if (!r || !s || !['owner', 'admin'].includes(s.my_role) || r.dataset.member === S.me.id) return; e.preventDefault();
  const m = S.members[s.id].find((x) => x.id === r.dataset.member); if (m.role === 'owner') return;
  menu(e.clientX, e.clientY, [s.my_role === 'owner' && !m.is_bot && [m.role === 'admin' ? 'Remove admin' : 'Make admin', () => tryRun(async () => { await api(`/servers/${s.id}/members/${m.id}`, { body: { role: m.role === 'admin' ? 'member' : 'admin' } }); m.role = m.role === 'admin' ? 'member' : 'admin'; renderMembers(); })],
    ['Kick ' + m.display_name, () => confirm('Kick ' + m.display_name + '?') && tryRun(() => api(`/servers/${s.id}/members/${m.id}`, { body: { action: 'kick' } })), 'danger']]);
});

// server modals
function serverMenu(s, x, y) {
  const admin = ['owner', 'admin'].includes(s.my_role);
  menu(x, y, [['📨 Invite people', () => inviteModal(s)], admin && ['⚙️ Server settings', () => serverSettingsModal(s)], admin && ['➕ Create channel', () => createChannelModal(s)], ['📅 Events', () => window.ZE?.open(s)], admin && ['😀 Emoji & stickers', () => emojiAdminModal(s)],
    admin && S.bots.length && ['🤖 Add one of my bots', () => addBotToServerModal(s)], s.my_role === 'owner' && !s.is_official && ['🗑️ Delete server', () => confirm(`Delete ${s.name}? This can't be undone.`) && tryRun(async () => { await api('/servers/' + s.id, { method: 'DELETE' }); }), 'danger'],
    s.my_role !== 'owner' && ['🚪 Leave server', () => confirm('Leave ' + s.name + '?') && tryRun(async () => { await api(`/servers/${s.id}/leave`, { body: {} }); S.servers = S.servers.filter((x) => x.id !== s.id); openHome(); }), 'danger']]);
}
function addServerModal() {
  const m = modal(`<h2>Create a server</h2><p class="muted">Your server is where you and your friends hang out.</p>
    <button class="choice" id="c-create">🛠️ <div><b>Create my own</b><div class="small muted">Start fresh with #general and #memes</div></div></button>
    <button class="choice" id="c-join">📨 <div><b>Join with an invite</b><div class="small muted">Paste an invite code or link</div></div></button>
    <button class="choice" id="c-disc">🧭 <div><b>Discover servers</b><div class="small muted">Browse public communities</div></div></button>`);
  $('#c-create', m).onclick = () => {
    const mm = modal(`<h2>Customize your server</h2><form id="cs"><label>Server icon<input type="file" name="icon" accept="image/*"></label><label>Server name<input name="name" required value="${esc(S.me.display_name)}'s server"></label>
      <label>Description<input name="description" placeholder="What's it about?"></label><label style="display:flex;align-items:center;gap:8px;text-transform:none"><input type="checkbox" name="pub" checked style="width:auto"> Show in Discover</label>
      <div class="row"><button class="btn primary">Create</button></div></form>`);
    $('#cs', mm).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const f = e.target; const icon = f.icon.files[0] ? await uploadOne(f.icon.files[0]) : null;
      const s = await api('/servers', { body: { name: f.name.value, description: f.description.value, icon, is_public: f.pub.checked } }); S.servers.push(s); closeModal(); openChannel(s.id, s.channels[0].id); }); };
  };
  $('#c-join', m).onclick = () => { const mm = modal(`<h2>Join a server</h2><form id="js"><label>Invite code or link<input name="code" required placeholder="abc123ef"></label><div class="row"><button class="btn primary">Join</button></div></form>`);
    $('#js', mm).onsubmit = (e) => { e.preventDefault(); tryRun(async () => joined(await api('/invite/' + encodeURIComponent(e.target.code.value.trim()), { body: {} }))); }; };
  $('#c-disc', m).onclick = () => discoverModal();
}
function joined(s) { if (!S.servers.find((x) => x.id === s.id)) S.servers.push(s); closeModal(); openChannel(s.id, s.channels[0]?.id); }
async function discoverModal(q = '') {
  const list = await api('/servers/discover?q=' + encodeURIComponent(q));
  const m = modal(`<h2>Discover communities</h2><input id="disc-q" placeholder="Search servers" value="${esc(q)}"><div class="grid" style="margin-top:12px">${list.map((s) => `<div class="card"><div class="cb" style="${s.banner ? `background-image:url('${esc(s.banner)}')` : ''}"></div>
    <div class="cc"><div style="display:flex;gap:8px;align-items:center"><span class="rail-btn" style="width:40px;height:40px;border-radius:12px">${serverIcon(s, 40)}</span><h3>${esc(s.name)} ${s.is_official ? '✅' : ''}</h3></div>
    <p class="small muted">${esc(s.description || 'No description')}</p><div class="small muted">👥 ${s.member_count} members</div><div class="row">${s.joined ? '<button class="btn sm" disabled>Joined</button>' : `<button class="btn primary sm" data-join="${s.id}">Join</button>`}</div></div></div>`).join('') || '<p class="muted">No servers found.</p>'}</div>`, 'wide');
  let t; $('#disc-q', m).oninput = (e) => { clearTimeout(t); t = setTimeout(() => discoverModal(e.target.value).then(() => { const i = $('#disc-q'); i.focus(); i.setSelectionRange(99, 99); }), 400); };
  m.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => tryRun(async () => joined(await api(`/servers/${b.dataset.join}/join`, { body: {} })))));
}
function inviteModal(s) {
  const link = location.origin + '/invite/' + s.invite_code;
  const m = modal(`<h2>Invite friends to ${esc(s.name)}</h2><label>Invite link<div style="display:flex;gap:8px"><input readonly value="${esc(link)}" id="inv"><button class="btn primary" id="copy-inv">Copy</button></div></label>
    <p class="small muted">Or share the code <b>${esc(s.invite_code)}</b></p>${['owner', 'admin'].includes(s.my_role) ? '<button class="btn sm" id="new-inv">Make a new link</button>' : ''}
    <div class="side-cat">Or send it to a friend</div>${S.friends.filter((f) => f.status === 'friend').map((f) => `<div class="friend-row">${avatar(f.user, 28)}<div class="grow">${esc(f.user.display_name)}</div><button class="btn sm" data-inv="${f.user.id}">Invite</button></div>`).join('') || '<p class="muted small">No friends yet.</p>'}`);
  $('#copy-inv', m).onclick = () => { navigator.clipboard?.writeText(link); toast('Copied!'); };
  $('#new-inv', m) && ($('#new-inv', m).onclick = () => tryRun(async () => { const ns = await api('/servers/' + s.id, { method: 'PATCH', body: { new_invite: true } }); Object.assign(s, ns); inviteModal(s); }));
  m.querySelectorAll('[data-inv]').forEach((b) => (b.onclick = () => tryRun(async () => { const d = await api('/dms', { body: { user_ids: [b.dataset.inv] } }); await api('/messages', { body: { dm_id: d.id, content: `Join me on **${s.name}**! ${link}` } }); b.textContent = 'Sent'; b.disabled = true; })));
}
function serverSettingsModal(s) {
  const m = modal(`<h2>Server settings</h2><form id="ss"><label>Name<input name="name" value="${esc(s.name)}"></label><label>Description<input name="description" value="${esc(s.description || '')}"></label>
    <label>Icon<input type="file" name="icon" accept="image/*"></label><label>Banner<input type="file" name="banner" accept="image/*"></label>
    <label style="display:flex;align-items:center;gap:8px;text-transform:none"><input type="checkbox" name="pub" ${s.is_public ? 'checked' : ''} style="width:auto"> Show in Discover</label>
    <div class="row"><button class="btn primary">Save</button></div></form>`);
  $('#ss', m).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const f = e.target; const body = { name: f.name.value, description: f.description.value, is_public: f.pub.checked };
    if (f.icon.files[0]) body.icon = await uploadOne(f.icon.files[0]); if (f.banner.files[0]) body.banner = await uploadOne(f.banner.files[0]);
    await api('/servers/' + s.id, { method: 'PATCH', body }); closeModal(); toast('Saved'); }); };
}
function createChannelModal(s, preType) {
  const m = modal(`<h2>Create channel</h2><form id="cc"><label>Channel name<input name="name" required placeholder="new-channel"></label><label>Topic<input name="topic"></label>
    <label>Type<select name="type"><option value="text"># Text — anyone can chat</option><option value="announcement">Announcement — only admins post</option><option value="voice" ${preType === 'voice' ? 'selected' : ''}>Voice — talk, video, screen share</option></select></label><div class="row"><button class="btn primary">Create</button></div></form>`);
  $('#cc', m).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const c = await api(`/servers/${s.id}/channels`, { body: Object.fromEntries(new FormData(e.target)) }); closeModal(); if (c.type !== 'voice') setTimeout(() => openChannel(s.id, c.id), 200); }); };
}
function editChannelModal(s, c) {
  const m = modal(`<h2>Edit #${esc(c.name)}</h2><form id="ec"><label>Name<input name="name" value="${esc(c.name)}"></label><label>Topic<input name="topic" value="${esc(c.topic || '')}"></label>
    <div class="row"><button type="button" class="btn danger" id="del-ch">Delete channel</button><button class="btn primary">Save</button></div></form>`);
  $('#ec', m).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { await api('/channels/' + c.id, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); }); };
  $('#del-ch', m).onclick = () => confirm('Delete #' + c.name + ' and all its messages?') && tryRun(async () => { await api('/channels/' + c.id, { method: 'DELETE' }); closeModal(); const o = s.channels.find((x) => x.id !== c.id); if (o) openChannel(s.id, o.id); });
}

// DMs
function newDmModal(existing) {
  const friends = S.friends.filter((f) => f.status === 'friend' && !(existing?.members || []).some((m) => m.id === f.user.id));
  const m = modal(`<h2>${existing ? 'Add people' : 'Select friends'}</h2><p class="muted small">${existing ? '' : 'Pick one friend for a DM, or several for a group DM (up to 10 people).'}</p>
    ${existing ? '' : '<label>Group name (optional)<input id="g-name" placeholder="The squad"></label>'}
    ${friends.map((f) => `<label class="friend-row" style="text-transform:none;font-size:15px;margin:0;display:flex">${avatar(f.user, 32)}<span class="grow">${esc(f.user.display_name)}</span><input type="checkbox" value="${f.user.id}" style="width:auto"></label>`).join('') || '<p class="muted">Add some friends first from the Friends tab.</p>'}
    <div class="row"><button class="btn primary" id="go-dm">${existing ? 'Add' : 'Create DM'}</button></div>`);
  $('#go-dm', m).onclick = () => tryRun(async () => { const ids = [...m.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value); if (!ids.length) return toast('Pick someone');
    if (existing) { await api('/dms/' + existing.id, { method: 'PATCH', body: { add: ids } }); closeModal(); return; }
    const d = await api('/dms', { body: { user_ids: ids, group: ids.length > 1, name: $('#g-name').value } }); if (!S.dms.find((x) => x.id === d.id)) S.dms.unshift(d); d.members.forEach(cacheUser); closeModal(); openDm(d.id); });
}
function groupEditModal(d) {
  const m = modal(`<h2>Group settings</h2><form id="ge"><label>Group name<input name="name" value="${esc(d.name || '')}"></label><label>Group icon<input type="file" name="icon" accept="image/*"></label>
    <div class="row"><button type="button" class="btn danger" id="leave-g">Leave group</button><button class="btn primary">Save</button></div></form>`);
  $('#ge', m).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const body = { name: e.target.name.value }; if (e.target.icon.files[0]) body.icon = await uploadOne(e.target.icon.files[0]); await api('/dms/' + d.id, { method: 'PATCH', body }); closeModal(); }); };
  $('#leave-g', m).onclick = () => confirm('Leave this group?') && tryRun(async () => { await api(`/dms/${d.id}/leave`, { body: {} }); S.dms = S.dms.filter((x) => x.id !== d.id); closeModal(); openHome(); });
}
async function pinsModal() { const q = S.view.channel ? 'channel_id=' + S.view.channel : 'dm_id=' + S.view.dm; const pins = await api('/pins?' + q);
  modal(`<h2>📌 Pinned messages</h2>${pins.map((p) => `<div class="friend-row">${avatar(p.author, 28)}<div class="grow"><b>${esc(p.author.display_name)}</b> <span class="small muted">${fmtTime(p.created_at)}</span><div class="text">${markdown(p.content || '📎 attachment')}</div></div></div>`).join('') || '<p class="muted">No pinned messages yet.</p>'}`); }
function searchModal() {
  const m = modal(`<h2>🔍 Search</h2><input id="sq" placeholder="Search messages here"><div id="sr" style="margin-top:8px"></div>`); let t;
  $('#sq', m).oninput = (e) => { clearTimeout(t); t = setTimeout(async () => { const q = (S.view.channel ? 'channel_id=' + S.view.channel : 'dm_id=' + S.view.dm) + '&q=' + encodeURIComponent(e.target.value);
    const r = e.target.value ? await api('/messages?' + q) : []; $('#sr').innerHTML = r.reverse().map((p) => `<div class="friend-row">${avatar(p.author, 28)}<div class="grow"><b>${esc(p.author.display_name)}</b> <span class="small muted">${fmtTime(p.created_at)}</span><div>${markdown(p.content)}</div></div></div>`).join('') || (e.target.value ? '<p class="muted">No results</p>' : ''); }, 300); };
  $('#sq', m).focus();
}

// shop
function shopModal() {
  const m = modal(`<h2>🛍️ Zuno Shop <span class="badge" style="background:var(--green);font-size:12px">EVERYTHING FREE</span></h2><p class="muted">Other apps charge for this. Here it's yours. Claim, then equip.</p>
    <div class="tabs"><button class="on" data-st="decoration">Avatar decorations</button><button data-st="nameplate">Name plates</button><button data-st="profile_frame">Profile frames</button></div><div class="grid" id="shop-grid"></div>`, 'wide');
  const draw = (type) => { $('#shop-grid', m).innerHTML = S.shop.filter((i) => i.type === type).map((i) => { const owned = S.inventory.includes(i.id); const on = S.me[type] === i.id;
    const prev = type === 'decoration' ? avatar({ ...S.me, decoration: i.id }, 64) : type === 'profile_frame' ? `<div class="frame-prev profile-card framed frame-${i.css}"><div class="banner" style="height:34px;background:${esc(S.me.banner_color || '#5865f2')}"></div><div style="padding:6px 8px;display:flex;gap:6px;align-items:center">${avatar({ ...S.me, decoration: null }, 26)}<b class="small">${esc(S.me.display_name)}</b></div></div>` : `<div class="plate-prev plate plate-${i.css}">${avatar({ ...S.me, decoration: null }, 28)} ${esc(S.me.display_name)}</div>`;
    return `<div class="shop-item"><div class="preview">${prev}</div><b>${esc(i.name)}</b><span class="small muted">Free</span>${!owned ? `<button class="btn primary sm" data-claim="${i.id}">Claim</button>` : on ? `<button class="btn sm" data-unequip="${type}">Unequip</button>` : `<button class="btn green sm" data-equip="${i.id}" data-type="${type}">Equip</button>`}</div>`; }).join('');
    m.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = () => tryRun(async () => { await api(`/shop/${b.dataset.claim}/claim`, { body: {} }); S.inventory.push(b.dataset.claim); toast('Claimed! 🎉'); draw(type); })));
    m.querySelectorAll('[data-equip]').forEach((b) => (b.onclick = () => tryRun(async () => { const u = await api('/me', { method: 'PATCH', body: { [b.dataset.type]: b.dataset.equip } }); Object.assign(S.me, u); cacheUser(u); renderMe(); draw(type); })));
    m.querySelectorAll('[data-unequip]').forEach((b) => (b.onclick = () => tryRun(async () => { const u = await api('/me', { method: 'PATCH', body: { [b.dataset.unequip]: null } }); Object.assign(S.me, u); cacheUser(u); renderMe(); draw(type); }))); };
  m.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { m.querySelectorAll('[data-st]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); draw(b.dataset.st); }));
  draw('decoration');
}

// bots (no code needed)
function botsModal() {
  const m = modal(`<h2>🤖 My Bots</h2><p class="muted">Make a bot with no code: give it a name and some commands. When someone types a trigger, your bot answers. Use {user} and {server} in replies.</p>
    ${S.bots.map((b) => `<div class="friend-row">${avatar(b, 36)}<div class="grow"><b>${esc(b.display_name)}</b> <span class="tag">BOT</span><div class="small muted">${b.commands.length} commands</div></div><button class="btn sm" data-edit-bot="${b.id}">Edit</button></div>`).join('')}
    <div class="row"><button class="btn primary" id="new-bot">+ Create a bot</button></div>`, 'wide');
  $('#new-bot', m).onclick = () => botEditor();
  m.querySelectorAll('[data-edit-bot]').forEach((b) => (b.onclick = () => botEditor(S.bots.find((x) => x.id === b.dataset.editBot))));
}
function botEditor(bot) {
  const cmds = bot?.commands?.length ? bot.commands : [{ trigger: '!hello', response: 'Hello {user}! Welcome to {server} 👋' }, { trigger: '!rules', response: '1. Be kind\n2. No spam\n3. Have fun' }];
  const owned = S.servers.filter((s) => ['owner', 'admin'].includes(s.my_role));
  const m = modal(`<h2>${bot ? 'Edit ' + esc(bot.display_name) : 'Create a bot'}</h2><form id="bf"><label>Bot name<input name="name" required value="${esc(bot?.display_name || '')}" placeholder="Helper Bot"></label>
    <label>Avatar<input type="file" name="avatar" accept="image/*"></label><label>About<input name="bio" value="${esc(bot?.bio || '')}"></label>
    <div class="side-cat" style="padding-left:0">Commands (trigger → reply)</div><div id="cmds">${cmds.map(cmdRow).join('')}</div><button type="button" class="btn sm" id="add-cmd">+ Add command</button>
    ${bot ? `<div class="side-cat" style="padding-left:0">Add to a server</div><div style="display:flex;gap:8px"><select id="bot-srv">${owned.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button type="button" class="btn green" id="bot-add">Add</button></div>
    <details style="margin-top:12px"><summary class="small muted">Developers: bot token for the API</summary><p class="small muted">POST /api/messages with header <code>Authorization: Bearer YOUR_TOKEN</code> and JSON {channel_id, content}.</p><button type="button" class="btn sm" id="bot-tok">Show token</button> <code id="tok"></code></details>` : ''}
    <div class="row">${bot ? '<button type="button" class="btn danger" id="bot-del">Delete bot</button>' : ''}<button class="btn primary">${bot ? 'Save' : 'Create bot'}</button></div></form>`, 'wide');
  $('#add-cmd', m).onclick = () => $('#cmds', m).insertAdjacentHTML('beforeend', cmdRow({ trigger: '', response: '' }));
  m.addEventListener('click', (e) => { if (e.target.matches('[data-rmcmd]')) e.target.closest('.cmd-row').remove(); });
  $('#bf', m).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const f = e.target;
    const commands = [...m.querySelectorAll('.cmd-row')].map((r) => ({ trigger: r.querySelector('[name=t]').value.trim(), response: r.querySelector('[name=r]').value })).filter((c) => c.trigger && c.response);
    const avatarUrl = f.avatar.files[0] ? await uploadOne(f.avatar.files[0]) : undefined;
    if (bot) { await api('/bots/' + bot.id, { method: 'PATCH', body: { display_name: f.name.value, bio: f.bio.value, commands, ...(avatarUrl ? { avatar: avatarUrl } : {}) } }); Object.assign(bot, { display_name: f.name.value, bio: f.bio.value, commands, ...(avatarUrl ? { avatar: avatarUrl } : {}) }); toast('Saved'); }
    else { const b = await api('/bots', { body: { name: f.name.value, bio: f.bio.value, commands, avatar: avatarUrl } }); S.bots.push(b); toast('Bot created! Now add it to a server.'); botEditor(b); return; }
    botsModal(); }); };
  if (bot) {
    $('#bot-add', m).onclick = () => tryRun(async () => { await api(`/bots/${bot.id}/add/${$('#bot-srv').value}`, { body: {} }); toast('Added! Try a trigger in that server.'); delete S.members[$('#bot-srv').value]; });
    $('#bot-tok', m).onclick = () => tryRun(async () => { $('#tok').textContent = (await api(`/bots/${bot.id}/token`)).token; });
    $('#bot-del', m).onclick = () => confirm('Delete this bot?') && tryRun(async () => { await api('/bots/' + bot.id, { method: 'DELETE' }); S.bots = S.bots.filter((x) => x.id !== bot.id); botsModal(); });
  }
}
const cmdRow = (c) => `<div class="cmd-row"><input name="t" placeholder="!command" value="${esc(c.trigger)}"><textarea name="r" rows="1" placeholder="Reply">${esc(c.response)}</textarea><button type="button" class="btn sm" data-rmcmd>✕</button></div>`;
function addBotToServerModal(s) {
  const m = modal(`<h2>Add a bot to ${esc(s.name)}</h2>${S.bots.map((b) => `<div class="friend-row">${avatar(b, 32)}<div class="grow">${esc(b.display_name)}</div><button class="btn green sm" data-ab="${b.id}">Add</button></div>`).join('')}`);
  m.querySelectorAll('[data-ab]').forEach((b) => (b.onclick = () => tryRun(async () => { await api(`/bots/${b.dataset.ab}/add/${s.id}`, { body: {} }); b.textContent = 'Added'; b.disabled = true; delete S.members[s.id]; })));
}

// settings
function settingsModal(tab = 'profile') {
  const u = S.me; const colors = ['#5865f2', '#7c5cff', '#eb459e', '#ed4245', '#f97316', '#f0b232', '#57f287', '#06b6d4', '#0f172a', '#ffffff'];
  const m = modal(`<h2>⚙️ Settings</h2><div class="tabs">${['profile', 'account', 'appearance', 'notifications', 'voice', 'get the app'].map((t) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div><div id="set-body"></div>
    <div class="row" style="justify-content:space-between"><button class="btn danger" id="logout">Log out</button></div>`, 'wide');
  const body = $('#set-body', m);
  const draw = (t) => {
    m.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'profile') {
      body.innerHTML = `<div style="display:flex;gap:20px;flex-wrap:wrap"><form id="pf" style="flex:1;min-width:260px"><label>Display name<input name="display_name" value="${esc(u.display_name)}" maxlength="32"></label>
        <label>Pronouns<input name="pronouns" value="${esc(u.pronouns || '')}" maxlength="40"></label><label>Custom status<input name="custom_status" value="${esc(u.custom_status || '')}" placeholder="Playing Roblox"></label>
        <label>About me<textarea name="bio" rows="3" maxlength="400">${esc(u.bio || '')}</textarea></label><label>Avatar (images or GIFs, free)<input type="file" name="avatar" accept="image/*"></label>
        <label>Banner (images or GIFs, free)<input type="file" name="banner" accept="image/*"></label><label>Name font (free)<select name="name_font"><option value="">Default</option>${NAME_FONTS.map((f) => `<option value="${f[0]}" ${u.name_font === f[0] ? 'selected' : ''}>${f[1]}</option>`).join('')}</select></label>
        <label>Connections <span class="small muted">(shown on your profile)</span><div id="conn-list"></div><button type="button" class="btn sm" id="conn-add" style="margin-top:6px">+ Add connection</button></label>
        <label>Banner color<div class="color-row">${colors.map((c) => `<button type="button" data-color="${c}" style="background:${c}" class="${u.banner_color === c ? 'on' : ''}"></button>`).join('')}</div></label>
        <div class="row" style="justify-content:flex-start">${u.avatar ? '<button type="button" class="btn sm" id="rm-av">Remove avatar</button>' : ''}${u.banner ? '<button type="button" class="btn sm" id="rm-bn">Remove banner</button>' : ''}<button type="button" class="btn sm" id="go-shop">🛍️ Decorations & plates</button></div>
        <div class="row"><button class="btn primary">Save changes</button></div></form><div id="pf-prev"></div></div>`;
      const prev = () => { $('#pf-prev').innerHTML = `<div class="side-cat">Preview</div><div class="profile-card"><div class="banner" style="background:${u.banner ? `url('${esc(u.banner)}') center/cover` : esc(u.banner_color)}"></div><div class="pc-body">${avatar(u, 88, true)}<div class="pc-inner${plateClass(u)}"><h3>${esc(u.display_name)}</h3><div class="muted">@${esc(u.username)}</div><div class="small">${esc(u.bio || '')}</div></div></div></div>`; };
      prev(); let color = u.banner_color;
      body.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => { color = b.dataset.color; body.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#go-shop') .onclick = () => shopModal();
      const connRow = (c = { type: 'youtube', name: '' }) => { const d0 = document.createElement('div'); d0.className = 'conn-row'; d0.innerHTML = `<select>${Object.keys(CONN_ICONS).map((k) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select><input placeholder="your name there" value="${esc(c.name)}" maxlength="60"><button type="button" class="btn sm">✕</button>`; d0.querySelector('button').onclick = () => d0.remove(); $('#conn-list').appendChild(d0); };
      (u.connections || []).forEach(connRow); $('#conn-add').onclick = () => connRow();
      const patch = async (bd) => { const nu = await api('/me', { method: 'PATCH', body: bd }); Object.assign(S.me, nu); cacheUser(nu); renderMe(); draw('profile'); toast('Saved'); };
      $('#rm-av') && ($('#rm-av').onclick = () => tryRun(() => patch({ avatar: null }))); $('#rm-bn') && ($('#rm-bn').onclick = () => tryRun(() => patch({ banner: null })));
      $('#pf').onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const f = e.target; const bd = { display_name: f.display_name.value, pronouns: f.pronouns.value, custom_status: f.custom_status.value, bio: f.bio.value, banner_color: color, name_font: f.name_font.value || null,
          connections: [...body.querySelectorAll('.conn-row')].map((r) => ({ type: r.querySelector('select').value, name: r.querySelector('input').value.trim() })).filter((c) => c.name) };
        if (f.avatar.files[0]) bd.avatar = await uploadOne(f.avatar.files[0]); if (f.banner.files[0]) bd.banner = await uploadOne(f.banner.files[0]); await patch(bd); }); };
    }
    if (t === 'account') {
      body.innerHTML = `<form id="un"><label>Username<input name="username" value="${esc(u.username)}" maxlength="32" pattern="[a-zA-Z0-9_.]{2,32}" required></label><div class="small muted">2-32 letters, numbers, _ or .</div><div class="row"><button class="btn primary">Change username</button></div></form><p>Email: <b>${esc(u.email || '')}</b></p><form id="pw"><label>Current password<input type="password" name="current_password" required></label><label>New password<input type="password" name="new_password" minlength="6" required></label><div class="row"><button class="btn primary">Change password</button></div></form>
        <div class="side-cat" style="padding-left:0;color:var(--red)">Danger zone</div><form id="delacc"><label>Type your password to delete your account forever<input type="password" name="password" required></label><div class="row"><button class="btn danger">Delete account</button></div></form>`;
      $('#delacc').onsubmit = (e) => { e.preventDefault(); if (!confirm('Delete your Zuno account forever? Your messages will show as Deleted User.')) return; tryRun(async () => { await api('/me/delete', { body: { password: e.target.password.value } }); closeModal(); toast('Account deleted'); logout(); }); };
      $('#un').onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const nu = await api('/me', { method: 'PATCH', body: { username: e.target.username.value } }); Object.assign(S.me, nu); cacheUser(nu); renderMe(); toast('Username changed to @' + nu.username); }); };
      $('#pw').onsubmit = (e) => { e.preventDefault(); tryRun(async () => { await api('/me', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Password changed'); }); };
    }
    if (t === 'appearance') {
      body.innerHTML = `<button class="choice" data-theme="dark">🌙 <b>Dark</b></button><button class="choice" data-theme="light">☀️ <b>Light</b></button>`;
      body.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => tryRun(async () => { await api('/me', { method: 'PATCH', body: { theme: b.dataset.theme } }); S.me.theme = b.dataset.theme; document.body.classList.toggle('light', b.dataset.theme === 'light'); })));
    }
    if (t === 'notifications') {
      const sp = Z.prefs();
      body.innerHTML = `<p class="muted">Get notifications for DMs and @mentions when Zuno isn't open.</p><button class="btn primary" id="notif">Turn on notifications</button>
        <div class="side-cat" style="padding-left:0">Sounds</div>${[['message', 'New message & DM'], ['mention', '@mention'], ['voice', 'Join, leave, mute & deafen'], ['ring', 'Call ringtone']].map(([k, l]) => `<label class="switch-row"><span>${l}</span><input type="checkbox" data-snd="${k}" ${sp[k] !== false ? 'checked' : ''}><button type="button" class="btn sm" data-try="${k}">▶ Test</button></label>`).join('')}
        <label>Volume<input type="range" min="0" max="100" value="${Math.round((sp.volume ?? 0.6) * 100)}" id="snd-vol"></label>`;
      body.querySelectorAll('[data-snd]').forEach((c) => (c.onchange = () => Z.setPref(c.dataset.snd, c.checked)));
      body.querySelectorAll('[data-try]').forEach((b) => (b.onclick = () => { const k = b.dataset.try; if (k === 'ring') { Z.ring(true); setTimeout(() => Z.ring(false), 2500); } else Z.sound(k === 'voice' ? 'join' : k, true); }));
      $('#snd-vol').oninput = (e) => Z.setPref('volume', e.target.value / 100);
      $('#notif').onclick = () => window.ZunoAndroid ? (ZunoAndroid.askNotify?.(), toast('Notifications on')) : window.Notification?.requestPermission().then((p) => toast(p === 'granted' ? 'Notifications on' : 'Notifications blocked by your browser'));
    }
    if (t === 'voice') window.ZV?.settings(body);
    if (t === 'get the app') {
      body.innerHTML = `<div class="dl-grid"><div class="dl"><div style="font-size:34px">🤖</div><b>Android</b><p class="small muted">Download the APK, then allow "install unknown apps" when asked.</p><a class="btn primary" href="https://github.com/arazJjj/Zuno-opensource-discord-clone/releases/latest" target="_blank">Download for Android</a></div>
        <div class="dl"><div style="font-size:34px">🍎</div><b>iPhone & iPad</b><p class="small muted">Open Zuno in Safari, tap Share, then "Add to Home Screen".</p></div>
        <div class="dl"><div style="font-size:34px">💻</div><b>Windows, Mac & Linux</b><p class="small muted">In Chrome or Edge, click the install icon in the address bar to get Zuno as an app.</p><button class="btn" id="pwa-btn">Install app</button></div></div>
        <p class="small muted">Zuno is free and open source. <a href="https://github.com/arazJjj/Zuno-opensource-discord-clone" target="_blank">See the code</a></p>`;
      $('#pwa-btn').onclick = () => { if (window._pwa) { window._pwa.prompt(); } else toast('Use your browser menu → Install Zuno'); };
    }
  };
  m.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => draw(b.dataset.tab))); draw(tab);
  $('#logout', m).onclick = () => { closeModal(); logout(); };
}

const NAME_FONTS = [['comic', 'Comic'], ['mono', 'Mono'], ['serif', 'Serif'], ['round', 'Rounded'], ['bold', 'Heavy'], ['script', 'Script'], ['pixel', 'Pixel'], ['wide', 'Wide']];
const CONN_ICONS = { youtube: '▶️', twitch: '🟣', roblox: '🟥', minecraft: '⛏️', steam: '🎮', github: '🐙', spotify: '🎵', instagram: '📸', tiktok: '🎶', x: '✖️', website: '🌐' };
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window._pwa = e; });
async function emojiAdminModal(s) {
  const list = (S.emojis || []).filter((e) => e.server_id === s.id);
  const m = modal(`<h2>😀 Emoji & stickers — ${esc(s.name)}</h2><p class="small muted">Upload images or GIFs. Use emoji as :name: in messages. Stickers show in the ＋ menu.</p>
    <form id="em"><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><input name="name" placeholder="name" required maxlength="32" style="flex:1;min-width:120px"><select name="kind" style="width:auto"><option value="emoji">Emoji</option><option value="sticker">Sticker</option></select><input type="file" name="file" accept="image/*" required style="flex:2;min-width:160px"><button class="btn primary">Add</button></div></form>
    <div class="em-list">${list.map((e) => `<div class="em-item"><img src="${esc(e.url)}"><span>${e.kind === 'emoji' ? ':' + esc(e.name) + ':' : esc(e.name) + ' (sticker)'}</span><button class="btn sm danger" data-del="${e.id}">✕</button></div>`).join('') || '<p class="muted small">No custom emoji yet.</p>'}</div>`, 'wide');
  $('#em', m).onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const f = e.target; const url = await uploadOne(f.file.files[0]); await api(`/servers/${s.id}/emojis`, { body: { name: f.name.value, kind: f.kind.value, url } }); S.emojis = await api('/emojis'); emojiAdminModal(s); toast('Added'); }); };
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => tryRun(async () => { await api('/emojis/' + b.dataset.del, { method: 'DELETE' }); S.emojis = await api('/emojis'); emojiAdminModal(s); })));
}

// invite links: /invite/CODE
(async () => {
  const mInv = location.pathname.match(/^\/invite\/([\w-]+)/);
  if (mInv) { sessionStorage.zunoInvite = mInv[1]; history.replaceState(null, '', '/'); }
  await start();
})();
