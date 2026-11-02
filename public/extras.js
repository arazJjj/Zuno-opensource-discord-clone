// Zuno extras: threads and server events.
window.ZT = (() => {
  let parent = null, list = [];
  const panel = () => document.getElementById('thread-panel');
  async function open(m) {
    parent = m; const r = await tryRun(() => api('/messages?thread_id=' + m.id)); if (!r) return;
    parent = r.parent; list = r.messages; render(); panel().classList.remove('hidden'); document.body.classList.add('thread-open');
  }
  function close() { parent = null; panel().classList.add('hidden'); panel().innerHTML = ''; document.body.classList.remove('thread-open'); }
  function render() {
    const p = panel(); if (!parent) return;
    p.innerHTML = `<div class="th-head"><b>🧵 Thread</b><span class="muted small">${list.length} ${list.length === 1 ? 'reply' : 'replies'}</span><div style="flex:1"></div><button id="th-close">✕</button></div>
      <div class="th-body" id="th-body"></div>
      <div class="th-composer"><textarea id="th-input" rows="1" placeholder="Reply in thread"></textarea><button class="icon-btn" id="th-st" title="Sticker">🎟️</button><button class="icon-btn send" id="th-send">➤</button></div>`;
    const body = document.getElementById('th-body');
    body.appendChild(msgEl(parent, true)); const sep = document.createElement('div'); sep.className = 'day-sep'; sep.textContent = 'Replies'; body.appendChild(sep);
    let prev = null; for (const m of list) { body.appendChild(msgEl(m, !prev || prev.author_id !== m.author_id)); prev = m; }
    body.scrollTop = body.scrollHeight;
    document.getElementById('th-close').onclick = close;
    const inp = document.getElementById('th-input');
    const sendT = (extra = {}) => { const content = inp.value.trim(); if (!content && !extra.attachments) return; inp.value = '';
      tryRun(() => api('/messages', { body: { content: extra.attachments ? '' : content, attachments: extra.attachments || [], thread_id: parent.id } })); };
    inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); sendT(); } };
    document.getElementById('th-send').onclick = () => sendT();
    document.getElementById('th-st').onclick = (e) => { e.stopPropagation(); stickerPicker(e.clientX, e.clientY, (att) => sendT({ attachments: att })); };
    body.onclick = (e) => {
      const v = e.target.closest('[data-vote]'); if (v) return tryRun(() => api(`/messages/${v.closest('[data-mid]').dataset.mid}/vote`, { body: { option: +v.dataset.vote } }));
      const prof = e.target.closest('[data-prof]'); if (prof) return profilePopover(prof.dataset.prof, e.clientX, e.clientY);
      if (e.target.matches('[data-light]')) return lightbox(e.target.src);
    };
  }
  function onMessage(m) { if (parent && m.thread_id === parent.id) { list.push(m); render(); } }
  function bind(s) {
    s.on('message:update', (m) => { if (!parent) return; if (m.id === parent.id) { parent = m; render(); } else { const i = list.findIndex((x) => x.id === m.id); if (i > -1) { list[i] = m; render(); } } });
    s.on('message:delete', ({ id }) => { if (!parent) return; if (id === parent.id) close(); else if (list.some((x) => x.id === id)) { list = list.filter((x) => x.id !== id); render(); } });
  }
  return { open, close, onMessage, bind };
})();

window.ZE = (() => {
  let cur = null;
  async function open(s) {
    cur = s; const evs = await tryRun(() => api(`/servers/${s.id}/events`)); if (!evs) return;
    const admin = ['owner', 'admin'].includes(s.my_role);
    const m = modal(`<h2>📅 Events — ${esc(s.name)}</h2>
      ${evs.length ? evs.map((e) => `<div class="event-card"><div class="ev-when">${new Date(e.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
        <h3>${esc(e.name)}</h3>${e.location ? `<div class="small">📍 ${esc(e.location)}</div>` : ''}${e.description ? `<div class="small muted" style="white-space:pre-wrap;margin-top:4px">${esc(e.description)}</div>` : ''}
        <div class="row" style="justify-content:flex-start;gap:8px;margin-top:8px"><button class="btn sm ${e.me_going ? 'green' : 'primary'}" data-rsvp="${e.id}">${e.me_going ? '✅ Going' : '🔔 Interested'}</button><span class="small muted">${e.going} going</span>
        ${admin ? `<button class="btn sm danger" data-delev="${e.id}">Delete</button>` : ''}</div></div>`).join('') : '<p class="muted">No upcoming events.</p>'}
      ${admin ? `<div class="side-cat" style="padding-left:0">Create an event</div><form id="ev-form"><label>Event name<input name="name" required maxlength="100" placeholder="Game night"></label>
        <label>Starts<input type="datetime-local" name="starts" required></label><label>Where<input name="location" placeholder="🔊 Lounge, a Roblox game, a website…"></label>
        <label>Description<textarea name="description" rows="2"></textarea></label><div class="row"><button class="btn primary">Create event</button></div></form>` : ''}`, 'wide');
    m.querySelectorAll('[data-rsvp]').forEach((b) => (b.onclick = () => tryRun(async () => { await api(`/events/${b.dataset.rsvp}/rsvp`, { body: {} }); open(s); })));
    m.querySelectorAll('[data-delev]').forEach((b) => (b.onclick = () => confirm('Delete this event?') && tryRun(async () => { await api('/events/' + b.dataset.delev, { method: 'DELETE' }); open(s); })));
    const f = m.querySelector('#ev-form');
    if (f) f.onsubmit = (e) => { e.preventDefault(); tryRun(async () => { await api(`/servers/${s.id}/events`, { body: { name: f.name.value, starts_at: new Date(f.starts.value).getTime(), location: f.location.value, description: f.description.value } }); toast('Event created'); open(s); }); };
  }
  function refresh() { if (cur && document.querySelector('.modal h2')?.textContent.startsWith('📅')) open(cur); }
  return { open, refresh };
})();
