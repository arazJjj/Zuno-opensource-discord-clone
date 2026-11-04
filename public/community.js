// Zuno community features: server lobby, forum channels, join applications, suggested friends, Shards.
// Original code. Loaded after app.js and uses its helpers (S, api, esc, modal, avatar, ZI, ...).
(() => {
  const $m = () => document.getElementById('messages');
  const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };

  // ---------------- Server lobby ----------------
  async function openLobby(sid) {
    const s = S.servers.find((x) => x.id === sid); if (!s) return;
    S.view = { type: 'server', server: sid, channel: null, dm: null, lobby: true }; saveView();
    closeNav(); renderRail(); renderSidebar(); renderHead();
    $('#composer').classList.add('hidden'); S.typing = {}; renderTyping(); S.messages = [];
    renderLobby(s);
    if (!S.members[sid]) S.members[sid] = await api('/servers/' + sid + '/members').catch(() => []);
    S.members[sid].forEach(cacheUser); renderMembers(); if (S.view.lobby && S.view.server === sid) renderLobby(s);
  }
  function renderLobby(s) {
    const L = lobbyOf(s); const admin = ['owner', 'admin'].includes(s.my_role);
    const ms = S.members[s.id] || []; const on = ms.filter((m) => S.users[m.id]?.online ?? m.online).length;
    const ch = (id) => s.channels.find((c) => c.id === id);
    const featured = (L.featured.length ? L.featured.map(ch).filter(Boolean) : s.channels.filter((c) => c.type !== 'voice').slice(0, 4));
    const icon = (c) => ZI(c.type === 'announcement' ? 'megaphone' : c.type === 'forum' ? 'message' : c.type === 'voice' ? 'volume' : 'hash');
    const box = $m();
    box.innerHTML = `<div class="lobby" style="--accent:${esc(L.accent)}">
      <div class="lobby-hero" style="background:${s.banner ? `linear-gradient(#0000,#000a),url('${esc(s.banner)}') center/cover` : `linear-gradient(135deg,${esc(L.banner_color)},${esc(L.accent)})`}">
        <div class="lobby-id"><span class="lobby-icon">${serverIcon(s, 80)}</span><div><h1>${esc(s.name)}</h1><p>${esc(L.tagline || s.description || 'Welcome! Pick a channel to start chatting.')}</p>
        <div class="lobby-stats"><span><i class="dot on"></i>${on} online</span><span><i class="dot"></i>${ms.length || '…'} members</span></div></div></div>
        ${admin ? `<button class="btn sm lobby-edit" id="lobby-edit">${ZI('pencil')} Edit lobby</button>` : ''}
      </div>
      ${L.buttons.length ? `<div class="lobby-btns">${L.buttons.filter((b) => ch(b.channel_id)).map((b) => `<button class="btn accent" data-go="${b.channel_id}">${esc(b.label)}</button>`).join('')}</div>` : ''}
      <div class="lobby-grid">
        <section><h3>Featured channels</h3><div class="feat">${featured.map((c) => `<button class="feat-card" data-go="${c.id}"><span class="fi">${icon(c)}</span><span><b>${esc(c.name)}</b><span class="small muted">${esc(c.topic || (c.type === 'forum' ? 'Forum' : c.type === 'voice' ? 'Voice channel' : 'Text channel'))}</span></span>${ZI('chevronRight')}</button>`).join('') || '<p class="muted small">No channels yet.</p>'}</div></section>
        <section><h3>Rules and info</h3><div class="rules">${L.rules ? `<div class="text">${markdown(L.rules)}</div>` : `<p class="muted small">${admin ? 'Add rules and info for new members in Edit lobby.' : 'Be kind and have fun.'}</p>`}</div></section>
      </div></div>`;
    box.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const c = ch(b.dataset.go); if (!c) return; if (c.type === 'voice') return window.ZV?.join('ch:' + c.id, c.name); openChannel(s.id, c.id); }));
    const e = document.getElementById('lobby-edit'); if (e) e.onclick = () => editLobby(s);
  }
  function editLobby(s) {
    const L = lobbyOf(s); const chans = s.channels;
    const opt = (sel) => chans.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${c.type === 'voice' ? 'Voice: ' : '#'}${esc(c.name)}</option>`).join('');
    const btnRow = (b = {}) => `<div class="lb-btn-row"><input placeholder="Button label" maxlength="30" value="${esc(b.label || '')}"><select>${opt(b.channel_id)}</select><button type="button" class="btn sm" data-rm>${ZI('x')}</button></div>`;
    const m = modal(`<h2>Customize lobby</h2><p class="small muted">The lobby is the home page people see when they open ${esc(s.name)}.</p><form id="lbf">
      <label style="display:flex;gap:8px;align-items:center;text-transform:none"><input type="checkbox" name="enabled" ${L.enabled ? 'checked' : ''} style="width:auto"> Show the lobby when people open this server</label>
      <div style="display:flex;gap:12px"><label style="flex:1">Banner colour<input type="color" name="banner_color" value="${esc(L.banner_color)}"></label><label style="flex:1">Accent colour<input type="color" name="accent" value="${esc(L.accent)}"></label></div>
      <label>Tagline<input name="tagline" maxlength="160" value="${esc(L.tagline)}" placeholder="The best place to hang out"></label>
      <label>Buttons <span class="small muted">(jump to a channel, up to 4)</span><div id="lb-btns">${L.buttons.map(btnRow).join('')}</div><button type="button" class="btn sm" id="lb-add" style="margin-top:6px">${ZI('plus')} Add button</button></label>
      <label>Featured channels<div class="lb-feat">${chans.map((c) => `<label class="chk"><input type="checkbox" value="${c.id}" ${L.featured.includes(c.id) ? 'checked' : ''}> ${c.type === 'voice' ? '' : '#'}${esc(c.name)}</label>`).join('')}</div></label>
      <label>Rules and info <span class="small muted">(markdown works)</span><textarea name="rules" rows="5" maxlength="2000" placeholder="1. Be kind\n2. No spam">${esc(L.rules)}</textarea></label>
      <div class="row"><button class="btn primary">Save lobby</button></div></form>`, 'wide');
    const wire = () => m.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => b.parentElement.remove()));
    wire(); m.querySelector('#lb-add').onclick = () => { if (m.querySelectorAll('.lb-btn-row').length >= 4) return; m.querySelector('#lb-btns').insertAdjacentHTML('beforeend', btnRow()); wire(); };
    m.querySelector('#lbf').onsubmit = (e) => { e.preventDefault(); const f = e.target;
      const lobby = { enabled: f.enabled.checked, banner_color: f.banner_color.value, accent: f.accent.value, tagline: f.tagline.value, rules: f.rules.value,
        buttons: [...m.querySelectorAll('.lb-btn-row')].map((r) => ({ label: r.querySelector('input').value.trim(), channel_id: r.querySelector('select').value })),
        featured: [...m.querySelectorAll('.lb-feat input:checked')].map((i) => i.value) };
      tryRun(async () => { const ns = await api('/servers/' + s.id, { method: 'PATCH', body: { lobby } }); const i = S.servers.findIndex((x) => x.id === s.id); if (i > -1) S.servers[i] = { ...S.servers[i], ...ns };
        closeModal(); toast('Lobby saved'); if (lobby.enabled) openLobby(s.id); else renderSidebar(); }); };
  }
  window.ZL = { open: openLobby, edit: editLobby, render: renderLobby };

  // ---------------- Forum channels ----------------
  let forumFilter = '';
  function renderForum() {
    const c = curChannel(); const box = $m(); if (!c) return;
    const posts = S.messages.filter((m) => !m.thread_id).sort((a, b) => (b.thread_last || b.created_at) - (a.thread_last || a.created_at))
      .filter((m) => !forumFilter || ((m.thread_name || '') + ' ' + (m.content || '')).toLowerCase().includes(forumFilter));
    box.innerHTML = `<div class="forum"><div class="forum-top"><div class="forum-search">${ZI('search')}<input id="forum-q" placeholder="Search posts" value="${esc(forumFilter)}"></div><button class="btn primary" id="forum-new">${ZI('plus')} New Post</button></div>
      ${c.topic ? `<p class="muted small forum-topic">${esc(c.topic)}</p>` : ''}
      <div class="forum-list">${posts.map((m) => { const a = S.users[m.author_id] || m.author || {}; const img = (m.attachments || []).find((x) => x.type?.startsWith('image') || x.gif);
        return `<button class="post-card" data-post="${m.id}"><div class="pc-main"><h3>${esc(m.thread_name || (m.content || 'Untitled').slice(0, 60))}</h3>
          <div class="pc-snip"><b>${esc(a.display_name || 'Someone')}:</b> ${esc((m.thread_name ? m.content : '').slice(0, 140) || (img ? 'Image' : ''))}</div>
          <div class="pc-meta">${ZI('message')} ${m.thread_count || 0} ${m.thread_count === 1 ? 'reply' : 'replies'} · ${ago(m.thread_last || m.created_at)}</div></div>${img ? `<img src="${esc(img.url)}" alt="">` : ''}</button>`; }).join('')
        || `<div class="welcome" style="text-align:center"><span class="big-ico">${ZI('message')}</span><h2>No posts yet</h2><p class="muted">Start the first conversation in #${esc(c.name)}.</p></div>`}</div></div>`;
    const q = document.getElementById('forum-q'); q.oninput = () => { forumFilter = q.value.toLowerCase(); const pos = q.selectionStart; renderForum(); const n = document.getElementById('forum-q'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('forum-new').onclick = newPost;
  }
  function newPost() {
    const c = curChannel(); if (!c) return;
    const m = modal(`<h2>New post in #${esc(c.name)}</h2><form id="np"><label>Title<input name="title" required maxlength="100" placeholder="What's this post about?"></label>
      <label>Message<textarea name="content" rows="5" required maxlength="4000" placeholder="Say more..."></textarea></label><div class="row"><button class="btn primary">Post</button></div></form>`);
    m.querySelector('#np').onsubmit = (e) => { e.preventDefault(); tryRun(async () => { const sent = await api('/messages', { body: { channel_id: c.id, title: e.target.title.value, content: e.target.content.value } });
      closeModal(); if (sent?.id && !S.messages.some((x) => x.id === sent.id)) { cacheUser(sent.author); S.messages.push(sent); } renderForum(); window.ZT?.open(sent); }); };
  }
  document.getElementById('messages').addEventListener('click', (e) => { const p = e.target.closest('[data-post]'); if (!p) return; const m = S.messages.find((x) => x.id === p.dataset.post); if (m) window.ZT?.open(m); });
  window.ZF = { render: renderForum, newPost };

  // ---------------- Join applications ----------------
  function apply(info) {
    const s = info.server;
    if (info.status === 'pending') return modal(`<h2>Application sent</h2><p class="muted">Your request to join <b>${esc(s.name)}</b> is waiting for an admin to approve it. You'll get a message here when it's accepted.</p>`);
    const qs = s.questions?.length ? s.questions : ['Tell the admins a little about yourself'];
    const m = modal(`<div style="display:flex;gap:12px;align-items:center"><span class="rail-btn" style="width:48px;height:48px">${serverIcon(s, 48)}</span><div><h2 style="margin:0">Apply to join ${esc(s.name)}</h2><div class="small muted">This server approves new members.</div></div></div>
      ${s.description ? `<p class="muted">${esc(s.description)}</p>` : ''}<form id="apf">${qs.map((q, i) => `<label>${esc(q)}<textarea name="a${i}" rows="2" maxlength="500" required></textarea></label>`).join('')}
      <div class="row"><button class="btn primary">Send application</button></div></form>`);
    m.querySelector('#apf').onsubmit = (e) => { e.preventDefault(); const answers = qs.map((_, i) => e.target['a' + i].value);
      tryRun(async () => { const r = await api(`/servers/${s.id}/apply`, { body: { answers } }); if (r.id) return joined(r); closeModal(); toast('Application sent! You will be let in once an admin approves.'); }); };
  }
  async function requests(s) {
    const r = await tryRun(() => api(`/servers/${s.id}/requests`)); if (!r) return;
    const m = modal(`<h2>Join requests: ${esc(s.name)}</h2>${r.requests.map((q) => `<div class="req" data-uid="${q.user.id}"><div class="req-head">${avatar(q.user, 36)}<div class="grow"><b>${esc(q.user.display_name)}</b> <span class="muted small">@${esc(q.user.username)} · ${ago(q.created_at)}</span></div>
      <button class="btn green sm" data-act="accept">Accept</button><button class="btn danger sm" data-act="reject">Reject</button></div>
      ${q.answers.map((a, i) => `<div class="req-a"><div class="small muted">${esc(r.questions[i] || 'Answer')}</div><div>${esc(a)}</div></div>`).join('')}</div>`).join('') || '<p class="muted">No pending requests.</p>'}`, 'wide');
    m.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => tryRun(async () => { const row = b.closest('[data-uid]'); await api(`/servers/${s.id}/requests/${row.dataset.uid}`, { body: { action: b.dataset.act } }); row.remove(); toast(b.dataset.act === 'accept' ? 'Accepted' : 'Rejected'); })));
  }
  window.ZJ = { apply, requests };

  // ---------------- Suggested friends ----------------
  async function renderSuggested(box) {
    box.innerHTML = '<p class="muted" style="padding:16px">Finding people you might know...</p>';
    const list = await api('/friends/suggested').catch(() => []);
    if (S.fTab !== 'suggested') return;
    box.innerHTML = `<div style="padding:16px"><div class="side-cat">Suggested — ${list.length}</div><p class="small muted" style="margin:0 8px 8px">Ranked by servers and interests you share. Add interests in Settings > Profile for better picks.</p>
      ${list.map((x) => `<div class="friend-row" data-uid="${x.user.id}">${avatar(x.user, 36, true)}<div class="grow"><b>${esc(x.user.display_name)}</b> <span class="muted small">@${esc(x.user.username)}</span>
        <div class="small muted">${x.shared_servers} mutual ${x.shared_servers === 1 ? 'server' : 'servers'}${x.shared_interests.length ? ' · also into ' + x.shared_interests.map(esc).join(', ') : ''}</div></div>
        <button class="btn green sm" data-add="${esc(x.user.username)}">Add Friend</button></div>`).join('') || '<p class="muted" style="padding:8px">No suggestions yet. Join more servers to meet people.</p>'}</div>`;
    box.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => tryRun(async () => { await api('/friends', { body: { username: b.dataset.add } }); b.textContent = 'Request sent'; b.disabled = true; })));
    box.querySelectorAll('.friend-row .av').forEach((a) => (a.onclick = (e) => profilePopover(a.closest('[data-uid]').dataset.uid, e.clientX, e.clientY)));
  }
  window.ZSug = { render: renderSuggested };

  // ---------------- Shards ----------------
  function openShards() {
    const u = S.me; const lvl = u.shard_level || 0; const cur = 25 * lvl * lvl, next = 25 * (lvl + 1) * (lvl + 1); const pct = Math.round(((u.shards || 0) - cur) * 100 / (next - cur));
    const m = modal(`<h2>${ZI('sparkles')} Shards</h2><p class="muted">Free points you earn just by showing up. Nothing to buy.</p>
      <div class="shard-card"><div class="shard-big">${u.shards || 0}</div><div class="grow"><b>Level ${lvl}</b><div class="lb-bar"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></div><div class="small muted">${next - (u.shards || 0)} Shards to level ${lvl + 1}</div></div></div>
      <div class="side-cat" style="padding-left:0">Streak</div><p>${u.streak || 0}-day streak. Come back tomorrow to keep it going.</p>
      <div class="side-cat" style="padding-left:0">How to earn</div><ul class="small"><li>Daily visit: 20 Shards, plus 5 more for each day in a row (up to +50)</li><li>Chatting: 2 Shards per active minute</li></ul>
      <div class="row"><button class="btn primary" id="sh-claim">Claim today's Shards</button></div>`);
    m.querySelector('#sh-claim').onclick = () => tryRun(async () => { const r = await api('/shards/daily', { body: {} }); Object.assign(S.me, { shards: r.shards, streak: r.streak, shard_level: r.shard_level });
      toast(r.claimed ? `+${r.gain} Shards!` : 'Already claimed today. Come back tomorrow!'); openShards(); if (S.view.type === 'home') renderSidebar(); });
  }
  window.ZS = { open: openShards };
})();
