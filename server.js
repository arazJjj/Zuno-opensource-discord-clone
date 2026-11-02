// Zuno - free real-time chat for communities.
// Express + Socket.IO + SQLite. Run: npm install && npm start
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- database ----------
const db = new Database(path.join(DATA_DIR, 'zuno.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email TEXT UNIQUE, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  password_hash TEXT, avatar TEXT, banner TEXT, banner_color TEXT DEFAULT '#5865f2', bio TEXT DEFAULT '',
  custom_status TEXT DEFAULT '', pronouns TEXT DEFAULT '', decoration TEXT, nameplate TEXT, theme TEXT DEFAULT 'dark',
  is_bot INTEGER DEFAULT 0, bot_owner TEXT, bot_token TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER);
CREATE TABLE IF NOT EXISTS servers(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, banner TEXT, description TEXT DEFAULT '', owner_id TEXT,
  is_public INTEGER DEFAULT 1, is_official INTEGER DEFAULT 0, invite_code TEXT UNIQUE, created_at INTEGER);
CREATE TABLE IF NOT EXISTS members(server_id TEXT REFERENCES servers(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', nickname TEXT, joined_at INTEGER, PRIMARY KEY(server_id,user_id));
CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY, server_id TEXT REFERENCES servers(id) ON DELETE CASCADE, name TEXT, topic TEXT DEFAULT '',
  type TEXT DEFAULT 'text', position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS dms(id TEXT PRIMARY KEY, name TEXT, icon TEXT, is_group INTEGER DEFAULT 0, owner_id TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS dm_members(dm_id TEXT REFERENCES dms(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(dm_id,user_id));
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, channel_id TEXT, dm_id TEXT, author_id TEXT, content TEXT DEFAULT '',
  attachments TEXT DEFAULT '[]', reply_to TEXT, pinned INTEGER DEFAULT 0, edited_at INTEGER, created_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_msg_ch ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_dm ON messages(dm_id, created_at);
CREATE TABLE IF NOT EXISTS reactions(message_id TEXT REFERENCES messages(id) ON DELETE CASCADE, user_id TEXT, emoji TEXT, PRIMARY KEY(message_id,user_id,emoji));
CREATE TABLE IF NOT EXISTS friends(user_id TEXT, friend_id TEXT, status TEXT, created_at INTEGER, PRIMARY KEY(user_id,friend_id));
CREATE TABLE IF NOT EXISTS blocks(user_id TEXT, blocked_id TEXT, PRIMARY KEY(user_id,blocked_id));
CREATE TABLE IF NOT EXISTS inventory(user_id TEXT, item_id TEXT, PRIMARY KEY(user_id,item_id));
CREATE TABLE IF NOT EXISTS bot_commands(bot_id TEXT REFERENCES users(id) ON DELETE CASCADE, trigger TEXT, response TEXT, PRIMARY KEY(bot_id,trigger));
CREATE TABLE IF NOT EXISTS reads(user_id TEXT, target_id TEXT, last_read INTEGER, PRIMARY KEY(user_id,target_id));
`);

const id = () => crypto.randomBytes(9).toString('base64url');
const now = () => Date.now();
const code = () => crypto.randomBytes(4).toString('hex');

// ---------- shop (everything is free) ----------
const SHOP = [
  { id: 'deco-flame', type: 'decoration', name: 'Flame Ring', css: 'flame' },
  { id: 'deco-neon', type: 'decoration', name: 'Neon Halo', css: 'neon' },
  { id: 'deco-rainbow', type: 'decoration', name: 'Rainbow Spin', css: 'rainbow' },
  { id: 'deco-gold', type: 'decoration', name: 'Gold Crown', css: 'gold' },
  { id: 'deco-sakura', type: 'decoration', name: 'Sakura Petals', css: 'sakura' },
  { id: 'deco-glitch', type: 'decoration', name: 'Glitch', css: 'glitch' },
  { id: 'plate-galaxy', type: 'nameplate', name: 'Galaxy', css: 'galaxy' },
  { id: 'plate-sunset', type: 'nameplate', name: 'Sunset', css: 'sunset' },
  { id: 'plate-ocean', type: 'nameplate', name: 'Ocean', css: 'ocean' },
  { id: 'plate-forest', type: 'nameplate', name: 'Forest', css: 'forest' },
  { id: 'plate-candy', type: 'nameplate', name: 'Candy', css: 'candy' },
  { id: 'plate-matrix', type: 'nameplate', name: 'Matrix', css: 'matrix' },
];

// ---------- seed: official server + Zuno Bot ----------
function seed() {
  let bot = db.prepare('SELECT * FROM users WHERE username=?').get('zuno');
  if (!bot) {
    db.prepare(`INSERT INTO users(id,username,display_name,is_bot,bio,banner_color,avatar,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run('zunobot', 'zuno', 'Zuno Bot', 1, 'Official Zuno bot. Type !help', '#7c3aed', '/logo.svg', now());
  }
  let off = db.prepare('SELECT * FROM servers WHERE is_official=1').get();
  if (!off) {
    db.prepare(`INSERT INTO servers(id,name,icon,description,owner_id,is_public,is_official,invite_code,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run('official', 'Zuno HQ', '/logo.svg', 'The official Zuno server. Say hi!', 'zunobot', 1, 1, 'zuno', now());
    const ch = db.prepare('INSERT INTO channels(id,server_id,name,topic,position) VALUES(?,?,?,?,?)');
    ch.run('off-welcome', 'official', 'welcome', 'Welcome to Zuno!', 0);
    ch.run('off-general', 'official', 'general', 'Talk about anything', 1);
    ch.run('off-gifs', 'official', 'memes-and-gifs', 'Post your best GIFs', 2);
    ch.run('off-bots', 'official', 'bot-commands', 'Try !help', 3);
    db.prepare('INSERT INTO members(server_id,user_id,role,joined_at) VALUES(?,?,?,?)').run('official', 'zunobot', 'owner', now());
    db.prepare('INSERT INTO messages(id,channel_id,author_id,content,created_at) VALUES(?,?,?,?,?)')
      .run(id(), 'off-welcome', 'zunobot', '**Welcome to Zuno!** Everything here is free: banners, animated decorations, name plates. Open the **Shop** in the bottom-left to grab yours. Type `!help` in #bot-commands.', now());
  }
}
seed();

// ---------- helpers ----------
const publicUser = (u) => u && ({
  id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, banner: u.banner,
  banner_color: u.banner_color, bio: u.bio, custom_status: u.custom_status, pronouns: u.pronouns,
  decoration: u.decoration, nameplate: u.nameplate, is_bot: !!u.is_bot, created_at: u.created_at,
  online: online.has(u.id) || !!u.is_bot,
});
const getUser = (uid) => db.prepare('SELECT * FROM users WHERE id=?').get(uid);
const isMember = (sid, uid) => !!db.prepare('SELECT 1 FROM members WHERE server_id=? AND user_id=?').get(sid, uid);
const memberRole = (sid, uid) => db.prepare('SELECT role FROM members WHERE server_id=? AND user_id=?').get(sid, uid)?.role;
const canManage = (sid, uid) => ['owner', 'admin'].includes(memberRole(sid, uid));
const inDm = (did, uid) => !!db.prepare('SELECT 1 FROM dm_members WHERE dm_id=? AND user_id=?').get(did, uid);
const channel = (cid) => db.prepare('SELECT * FROM channels WHERE id=?').get(cid);

function hydrateMessage(m) {
  if (!m) return null;
  const reacts = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id=?').all(m.id);
  const grouped = {};
  for (const r of reacts) (grouped[r.emoji] ||= []).push(r.user_id);
  let reply = null;
  if (m.reply_to) {
    const r = db.prepare('SELECT id, author_id, content FROM messages WHERE id=?').get(m.reply_to);
    if (r) reply = { id: r.id, content: r.content.slice(0, 120), author: publicUser(getUser(r.author_id)) };
  }
  return { ...m, attachments: JSON.parse(m.attachments || '[]'), author: publicUser(getUser(m.author_id)),
    reactions: Object.entries(grouped).map(([emoji, users]) => ({ emoji, users })), reply, pinned: !!m.pinned };
}

function joinServer(sid, uid, role = 'member') {
  if (isMember(sid, uid)) return;
  db.prepare('INSERT INTO members(server_id,user_id,role,joined_at) VALUES(?,?,?,?)').run(sid, uid, role, now());
  io.to('user:' + uid).socketsJoin('server:' + sid);
  io.to('server:' + sid).emit('member:join', { server_id: sid, user: publicUser(getUser(uid)) });
}

function createMessage({ channel_id = null, dm_id = null, author_id, content = '', attachments = [], reply_to = null }) {
  const m = { id: id(), channel_id, dm_id, author_id, content: String(content).slice(0, 4000),
    attachments: JSON.stringify(attachments), reply_to, created_at: now() };
  db.prepare(`INSERT INTO messages(id,channel_id,dm_id,author_id,content,attachments,reply_to,created_at)
    VALUES(@id,@channel_id,@dm_id,@author_id,@content,@attachments,@reply_to,@created_at)`).run(m);
  const full = hydrateMessage(db.prepare('SELECT * FROM messages WHERE id=?').get(m.id));
  const room = channel_id ? 'channel:' + channel_id : 'dm:' + dm_id;
  if (channel_id) {
    const ch = channel(channel_id);
    io.to('server:' + ch.server_id).emit('message:new', full);
  } else {
    for (const r of db.prepare('SELECT user_id FROM dm_members WHERE dm_id=?').all(dm_id)) io.to('user:' + r.user_id).emit('message:new', full);
  }
  if (!getUser(author_id)?.is_bot) setImmediate(() => runBots(full));
  return full;
}

// ---------- bots ----------
const JOKES = ['Why do programmers prefer dark mode? Because light attracts bugs.', 'I told my Wi-Fi a joke. It did not get the connection.',
  'Why was the computer cold? It left its Windows open.', 'There are 10 kinds of people: those who know binary and those who do not.'];
const BALL = ['Yes.', 'No.', 'Definitely!', 'Ask again later.', 'Not a chance.', 'Most likely.', 'The stars say yes.', 'I would not count on it.'];
function botReply(botId, msg, content) {
  createMessage({ channel_id: msg.channel_id, dm_id: msg.dm_id, author_id: botId, content, reply_to: msg.id });
}
function runBots(msg) {
  const text = (msg.content || '').trim();
  // built-in Zuno Bot
  const inZunoScope = msg.channel_id ? isMember(channel(msg.channel_id).server_id, 'zunobot') : inDm(msg.dm_id, 'zunobot');
  if (inZunoScope && text.startsWith('!')) {
    const [cmd, ...rest] = text.slice(1).split(/\s+/); const arg = rest.join(' ');
    const replies = {
      help: '**Zuno Bot commands**\n`!ping` `!roll [sides]` `!coin` `!8ball question` `!joke` `!avatar` `!serverinfo` `!say text` `!time`',
      ping: 'Pong! 🏓', coin: Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails',
      roll: '🎲 You rolled **' + (1 + Math.floor(Math.random() * (parseInt(arg) || 6))) + '**',
      '8ball': '🎱 ' + BALL[Math.floor(Math.random() * BALL.length)], joke: JOKES[Math.floor(Math.random() * JOKES.length)],
      avatar: msg.author.avatar ? msg.author.avatar : 'You have no avatar yet. Set one in Settings!',
      say: arg || 'Say what?', time: '🕒 ' + new Date().toUTCString(),
      serverinfo: (() => { if (!msg.channel_id) return 'This is a DM.'; const s = db.prepare('SELECT * FROM servers WHERE id=?').get(channel(msg.channel_id).server_id);
        const c = db.prepare('SELECT COUNT(*) n FROM members WHERE server_id=?').get(s.id).n; return `**${s.name}** · ${c} members · invite: \`${s.invite_code}\``; })(),
    };
    if (replies[cmd.toLowerCase()]) botReply('zunobot', msg, replies[cmd.toLowerCase()]);
  }
  // no-code user bots: trigger -> response, in servers they were added to
  if (msg.channel_id) {
    const sid = channel(msg.channel_id).server_id;
    const bots = db.prepare('SELECT u.id FROM users u JOIN members m ON m.user_id=u.id WHERE m.server_id=? AND u.is_bot=1 AND u.id<>?').all(sid, 'zunobot');
    for (const b of bots) {
      for (const c of db.prepare('SELECT * FROM bot_commands WHERE bot_id=?').all(b.id)) {
        if (text.toLowerCase() === c.trigger.toLowerCase() || text.toLowerCase().startsWith(c.trigger.toLowerCase() + ' ')) {
          botReply(b.id, msg, c.response.replaceAll('{user}', '@' + msg.author.username).replaceAll('{server}', db.prepare('SELECT name FROM servers WHERE id=?').get(sid).name));
        }
      }
    }
  }
}

// ---------- app ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });
const online = new Map(); // userId -> socket count

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, f, cb) => cb(null, id() + path.extname(f.originalname).toLowerCase().slice(0, 8)) }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && db.prepare('SELECT user_id FROM sessions WHERE token=?').get(token);
  if (s) { req.user = getUser(s.user_id); return next(); }
  const bot = token && db.prepare('SELECT * FROM users WHERE bot_token=? AND is_bot=1').get(token.replace(/^Bot /, ''));
  if (bot) { req.user = bot; return next(); }
  res.status(401).json({ error: 'Not signed in' });
}
const err = (res, msg, code = 400) => res.status(code).json({ error: msg });
const newSession = (uid) => { const t = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(t, uid, now()); return t; };

// auth
app.post('/api/register', (req, res) => {
  let { email, username, display_name, password } = req.body || {};
  username = String(username || '').toLowerCase().trim();
  if (!/^[a-z0-9_.]{2,32}$/.test(username)) return err(res, 'Username: 2-32 letters, numbers, _ or .');
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return err(res, 'Enter a valid email');
  if (!password || password.length < 6) return err(res, 'Password needs at least 6 characters');
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return err(res, 'That username is taken');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return err(res, 'That email already has an account');
  const uid = id();
  const colors = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#7c3aed', '#06b6d4', '#f97316'];
  db.prepare(`INSERT INTO users(id,email,username,display_name,password_hash,banner_color,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(uid, email.toLowerCase(), username, (display_name || username).slice(0, 32), bcrypt.hashSync(password, 10), colors[Math.floor(Math.random() * colors.length)], now());
  // land everyone in the official server, with a DM from Zuno Bot
  joinServer('official', uid);
  createMessage({ channel_id: 'off-general', author_id: 'zunobot', content: `👋 Everyone welcome @${username} to Zuno!` });
  const dm = openDm(uid, 'zunobot');
  createMessage({ dm_id: dm.id, author_id: 'zunobot', content: `Hey **${display_name || username}**! I'm Zuno Bot. Everything on Zuno is free, so hit the 🛍️ Shop to grab a decoration and a name plate. Type \`!help\` to see my commands.` });
  res.json({ token: newSession(uid), user: publicUser(getUser(uid)) });
});
app.post('/api/login', (req, res) => {
  const { login, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE (username=? OR email=?) AND is_bot=0').get(String(login || '').toLowerCase(), String(login || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) return err(res, 'Wrong username/email or password', 401);
  res.json({ token: newSession(u.id), user: publicUser(u) });
});
app.post('/api/logout', auth, (req, res) => { db.prepare('DELETE FROM sessions WHERE token=?').run(req.headers.authorization.replace('Bearer ', '')); res.json({ ok: true }); });

// everything the client needs at start
app.get('/api/bootstrap', auth, (req, res) => {
  const uid = req.user.id;
  const servers = db.prepare('SELECT s.* FROM servers s JOIN members m ON m.server_id=s.id WHERE m.user_id=? ORDER BY s.is_official DESC, m.joined_at').all(uid)
    .map((s) => ({ ...s, channels: db.prepare('SELECT * FROM channels WHERE server_id=? ORDER BY position').all(s.id), my_role: memberRole(s.id, uid) }));
  res.json({ me: { ...publicUser(req.user), email: req.user.email, theme: req.user.theme }, servers, dms: listDms(uid), friends: listFriends(uid),
    inventory: db.prepare('SELECT item_id FROM inventory WHERE user_id=?').all(uid).map((r) => r.item_id), shop: SHOP,
    bots: db.prepare('SELECT * FROM users WHERE bot_owner=?').all(uid).map((b) => ({ ...publicUser(b), commands: db.prepare('SELECT trigger,response FROM bot_commands WHERE bot_id=?').all(b.id) })),
    gifs_enabled: !!(process.env.TENOR_API_KEY || process.env.GIPHY_API_KEY),
    reads: Object.fromEntries(db.prepare('SELECT target_id,last_read FROM reads WHERE user_id=?').all(uid).map((r) => [r.target_id, r.last_read])) });
});

// profile & settings
app.patch('/api/me', auth, (req, res) => {
  const allowed = ['display_name', 'bio', 'custom_status', 'pronouns', 'banner_color', 'avatar', 'banner', 'theme', 'decoration', 'nameplate'];
  const inv = db.prepare('SELECT item_id FROM inventory WHERE user_id=?').all(req.user.id).map((r) => r.item_id);
  for (const k of allowed) if (k in req.body) {
    let v = req.body[k] == null ? null : String(req.body[k]).slice(0, k === 'bio' ? 400 : 200);
    if ((k === 'decoration' || k === 'nameplate') && v && !inv.includes(v)) return err(res, 'Get that item from the Shop first');
    db.prepare(`UPDATE users SET ${k}=? WHERE id=?`).run(v, req.user.id);
  }
  if (req.body.new_password) {
    if (!bcrypt.compareSync(req.body.current_password || '', req.user.password_hash)) return err(res, 'Current password is wrong');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.new_password, 10), req.user.id);
  }
  const u = publicUser(getUser(req.user.id));
  io.emit('user:update', u);
  res.json(u);
});
app.get('/api/users/:id', auth, (req, res) => {
  const u = getUser(req.params.id) || db.prepare('SELECT * FROM users WHERE username=?').get(req.params.id);
  if (!u) return err(res, 'User not found', 404);
  const mutual = db.prepare('SELECT s.id,s.name,s.icon FROM servers s JOIN members a ON a.server_id=s.id AND a.user_id=? JOIN members b ON b.server_id=s.id AND b.user_id=?').all(req.user.id, u.id);
  res.json({ ...publicUser(u), mutual_servers: mutual });
});

// uploads (images, gifs, videos, files)
app.post('/api/upload', auth, upload.array('files', 10), (req, res) => {
  res.json((req.files || []).map((f) => ({ url: '/uploads/' + f.filename, name: f.originalname, type: f.mimetype, size: f.size })));
});

// shop: everything free
app.post('/api/shop/:item/claim', auth, (req, res) => {
  if (!SHOP.find((s) => s.id === req.params.item)) return err(res, 'No such item', 404);
  db.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?)').run(req.user.id, req.params.item);
  res.json({ ok: true });
});

// GIFs (Tenor or GIPHY; set TENOR_API_KEY or GIPHY_API_KEY)
app.get('/api/gifs', auth, async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  try {
    if (process.env.TENOR_API_KEY) {
      const url = q ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${process.env.TENOR_API_KEY}&client_key=zuno&limit=30&media_filter=gif,tinygif`
                    : `https://tenor.googleapis.com/v2/featured?key=${process.env.TENOR_API_KEY}&client_key=zuno&limit=30&media_filter=gif,tinygif`;
      const j = await (await fetch(url)).json();
      return res.json((j.results || []).map((r) => ({ id: r.id, preview: r.media_formats.tinygif?.url, url: r.media_formats.gif?.url, title: r.content_description })));
    }
    if (process.env.GIPHY_API_KEY) {
      const url = q ? `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=30&rating=pg-13`
                    : `https://api.giphy.com/v1/gifs/trending?api_key=${process.env.GIPHY_API_KEY}&limit=30&rating=pg-13`;
      const j = await (await fetch(url)).json();
      return res.json((j.data || []).map((g) => ({ id: g.id, preview: g.images.fixed_width_small.url, url: g.images.original.url, title: g.title })));
    }
    res.json([]);
  } catch (e) { err(res, 'GIF search failed', 502); }
});

// servers
app.post('/api/servers', auth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return err(res, 'Give your server a name');
  const sid = id();
  db.prepare('INSERT INTO servers(id,name,icon,description,owner_id,is_public,invite_code,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(sid, name, req.body.icon || null, String(req.body.description || '').slice(0, 300), req.user.id, req.body.is_public === false ? 0 : 1, code(), now());
  db.prepare('INSERT INTO channels(id,server_id,name,position) VALUES(?,?,?,?)').run(id(), sid, 'general', 0);
  db.prepare('INSERT INTO channels(id,server_id,name,position) VALUES(?,?,?,?)').run(id(), sid, 'memes', 1);
  joinServer(sid, req.user.id, 'owner');
  res.json(serverFull(sid, req.user.id));
});
function serverFull(sid, uid) {
  const s = db.prepare('SELECT * FROM servers WHERE id=?').get(sid);
  return { ...s, channels: db.prepare('SELECT * FROM channels WHERE server_id=? ORDER BY position').all(sid), my_role: memberRole(sid, uid) };
}
app.get('/api/servers/discover', auth, (req, res) => {
  const q = '%' + String(req.query.q || '') + '%';
  res.json(db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM members m WHERE m.server_id=s.id) member_count FROM servers s
    WHERE s.is_public=1 AND (s.name LIKE ? OR s.description LIKE ?) ORDER BY s.is_official DESC, member_count DESC LIMIT 60`).all(q, q)
    .map((s) => ({ ...s, joined: isMember(s.id, req.user.id) })));
});
app.post('/api/servers/:id/join', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id=? AND is_public=1').get(req.params.id);
  if (!s) return err(res, 'Server not found', 404);
  joinServer(s.id, req.user.id); res.json(serverFull(s.id, req.user.id));
});
app.post('/api/invite/:code', auth, (req, res) => {
  const c = String(req.params.code).replace(/.*\//, '');
  const s = db.prepare('SELECT * FROM servers WHERE invite_code=?').get(c);
  if (!s) return err(res, 'That invite is invalid or expired', 404);
  joinServer(s.id, req.user.id); res.json(serverFull(s.id, req.user.id));
});
app.patch('/api/servers/:id', auth, (req, res) => {
  if (!canManage(req.params.id, req.user.id)) return err(res, 'Only admins can do that', 403);
  for (const k of ['name', 'icon', 'banner', 'description']) if (k in req.body) db.prepare(`UPDATE servers SET ${k}=? WHERE id=?`).run(String(req.body[k] ?? '').slice(0, 300) || null, req.params.id);
  if ('is_public' in req.body) db.prepare('UPDATE servers SET is_public=? WHERE id=?').run(req.body.is_public ? 1 : 0, req.params.id);
  if (req.body.new_invite) db.prepare('UPDATE servers SET invite_code=? WHERE id=?').run(code(), req.params.id);
  const s = serverFull(req.params.id, req.user.id); io.to('server:' + s.id).emit('server:update', s); res.json(s);
});
app.delete('/api/servers/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!s || s.owner_id !== req.user.id || s.is_official) return err(res, 'Only the owner can delete this server', 403);
  io.to('server:' + s.id).emit('server:delete', { id: s.id });
  db.prepare('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id=?)').run(s.id);
  db.prepare('DELETE FROM servers WHERE id=?').run(s.id); res.json({ ok: true });
});
app.post('/api/servers/:id/leave', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (s.owner_id === req.user.id) return err(res, 'Owners delete their server instead of leaving');
  db.prepare('DELETE FROM members WHERE server_id=? AND user_id=?').run(s.id, req.user.id);
  io.in('user:' + req.user.id).socketsLeave('server:' + s.id);
  io.to('server:' + s.id).emit('member:leave', { server_id: s.id, user_id: req.user.id }); res.json({ ok: true });
});
app.get('/api/servers/:id/members', auth, (req, res) => {
  if (!isMember(req.params.id, req.user.id)) return err(res, 'Not a member', 403);
  res.json(db.prepare('SELECT u.*, m.role FROM users u JOIN members m ON m.user_id=u.id WHERE m.server_id=?').all(req.params.id).map((u) => ({ ...publicUser(u), role: u.role })));
});
app.post('/api/servers/:id/members/:uid', auth, (req, res) => { // role change or kick
  if (!canManage(req.params.id, req.user.id)) return err(res, 'Only admins can do that', 403);
  const target = memberRole(req.params.id, req.params.uid);
  if (target === 'owner') return err(res, 'You cannot change the owner');
  if (req.body.action === 'kick') {
    db.prepare('DELETE FROM members WHERE server_id=? AND user_id=?').run(req.params.id, req.params.uid);
    io.in('user:' + req.params.uid).socketsLeave('server:' + req.params.id);
    io.to('user:' + req.params.uid).emit('server:delete', { id: req.params.id });
    io.to('server:' + req.params.id).emit('member:leave', { server_id: req.params.id, user_id: req.params.uid });
  } else if (['admin', 'member'].includes(req.body.role)) {
    db.prepare('UPDATE members SET role=? WHERE server_id=? AND user_id=?').run(req.body.role, req.params.id, req.params.uid);
  }
  res.json({ ok: true });
});

// channels
app.post('/api/servers/:id/channels', auth, (req, res) => {
  if (!canManage(req.params.id, req.user.id)) return err(res, 'Only admins can make channels', 403);
  const name = String(req.body.name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '').slice(0, 40);
  if (!name) return err(res, 'Channel needs a name');
  const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM channels WHERE server_id=?').get(req.params.id).p;
  const cid = id();
  db.prepare('INSERT INTO channels(id,server_id,name,topic,type,position) VALUES(?,?,?,?,?,?)').run(cid, req.params.id, name, String(req.body.topic || ''), req.body.type === 'announcement' ? 'announcement' : 'text', pos);
  const s = serverFull(req.params.id, req.user.id); io.to('server:' + s.id).emit('server:update', s); res.json(channel(cid));
});
app.patch('/api/channels/:id', auth, (req, res) => {
  const ch = channel(req.params.id); if (!ch || !canManage(ch.server_id, req.user.id)) return err(res, 'Only admins can edit channels', 403);
  if (req.body.name) db.prepare('UPDATE channels SET name=? WHERE id=?').run(String(req.body.name).toLowerCase().replace(/\s+/g, '-').slice(0, 40), ch.id);
  if ('topic' in req.body) db.prepare('UPDATE channels SET topic=? WHERE id=?').run(String(req.body.topic).slice(0, 300), ch.id);
  const s = serverFull(ch.server_id, req.user.id); io.to('server:' + s.id).emit('server:update', s); res.json({ ok: true });
});
app.delete('/api/channels/:id', auth, (req, res) => {
  const ch = channel(req.params.id); if (!ch || !canManage(ch.server_id, req.user.id)) return err(res, 'Only admins can delete channels', 403);
  db.prepare('DELETE FROM messages WHERE channel_id=?').run(ch.id); db.prepare('DELETE FROM channels WHERE id=?').run(ch.id);
  const s = serverFull(ch.server_id, req.user.id); io.to('server:' + s.id).emit('server:update', s); res.json({ ok: true });
});

// messages
function canSee(req, { channel_id, dm_id }) {
  if (channel_id) { const ch = channel(channel_id); return ch && isMember(ch.server_id, req.user.id); }
  return dm_id && inDm(dm_id, req.user.id);
}
app.get('/api/messages', auth, (req, res) => {
  const { channel_id, dm_id, before, q } = req.query;
  if (!canSee(req, { channel_id, dm_id })) return err(res, 'No access', 403);
  const col = channel_id ? 'channel_id' : 'dm_id';
  let rows;
  if (q) rows = db.prepare(`SELECT * FROM messages WHERE ${col}=? AND content LIKE ? ORDER BY created_at DESC LIMIT 50`).all(channel_id || dm_id, '%' + q + '%');
  else rows = db.prepare(`SELECT * FROM messages WHERE ${col}=? AND created_at < ? ORDER BY created_at DESC LIMIT 50`).all(channel_id || dm_id, Number(before) || 9e15);
  res.json(rows.reverse().map(hydrateMessage));
});
app.get('/api/pins', auth, (req, res) => {
  const { channel_id, dm_id } = req.query; if (!canSee(req, { channel_id, dm_id })) return err(res, 'No access', 403);
  res.json(db.prepare(`SELECT * FROM messages WHERE ${channel_id ? 'channel_id' : 'dm_id'}=? AND pinned=1 ORDER BY created_at DESC`).all(channel_id || dm_id).map(hydrateMessage));
});
app.post('/api/messages', auth, (req, res) => {
  const { channel_id, dm_id, content, attachments, reply_to } = req.body || {};
  if (!canSee(req, { channel_id, dm_id })) return err(res, 'No access', 403);
  if (channel_id) { const ch = channel(channel_id); if (ch.type === 'announcement' && !canManage(ch.server_id, req.user.id)) return err(res, 'Only admins can post here', 403); }
  if (dm_id) { // blocked?
    const others = db.prepare('SELECT user_id FROM dm_members WHERE dm_id=? AND user_id<>?').all(dm_id, req.user.id);
    const d = db.prepare('SELECT is_group FROM dms WHERE id=?').get(dm_id);
    if (!d.is_group && others.some((o) => db.prepare('SELECT 1 FROM blocks WHERE user_id=? AND blocked_id=?').get(o.user_id, req.user.id))) return err(res, 'You cannot message this user', 403);
  }
  const att = Array.isArray(attachments) ? attachments.slice(0, 10).filter((a) => a && typeof a.url === 'string').map((a) => ({ url: a.url, name: String(a.name || ''), type: String(a.type || ''), gif: !!a.gif })) : [];
  if (!String(content || '').trim() && !att.length) return err(res, 'Empty message');
  res.json(createMessage({ channel_id: channel_id || null, dm_id: dm_id || null, author_id: req.user.id, content, attachments: att, reply_to: reply_to || null }));
});
function broadcastMessage(m, event, payload) {
  if (m.channel_id) io.to('server:' + channel(m.channel_id).server_id).emit(event, payload);
  else for (const r of db.prepare('SELECT user_id FROM dm_members WHERE dm_id=?').all(m.dm_id)) io.to('user:' + r.user_id).emit(event, payload);
}
app.patch('/api/messages/:id', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m) return err(res, 'Not found', 404);
  if ('pinned' in req.body) {
    if (!canSee(req, m) || (m.channel_id && !canManage(channel(m.channel_id).server_id, req.user.id))) return err(res, 'Only admins can pin', 403);
    db.prepare('UPDATE messages SET pinned=? WHERE id=?').run(req.body.pinned ? 1 : 0, m.id);
  } else {
    if (m.author_id !== req.user.id) return err(res, 'You can only edit your own messages', 403);
    db.prepare('UPDATE messages SET content=?, edited_at=? WHERE id=?').run(String(req.body.content || '').slice(0, 4000), now(), m.id);
  }
  const full = hydrateMessage(db.prepare('SELECT * FROM messages WHERE id=?').get(m.id)); broadcastMessage(m, 'message:update', full); res.json(full);
});
app.delete('/api/messages/:id', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m) return err(res, 'Not found', 404);
  const mod = m.channel_id && canManage(channel(m.channel_id).server_id, req.user.id);
  if (m.author_id !== req.user.id && !mod) return err(res, 'Not allowed', 403);
  db.prepare('DELETE FROM messages WHERE id=?').run(m.id); broadcastMessage(m, 'message:delete', { id: m.id, channel_id: m.channel_id, dm_id: m.dm_id }); res.json({ ok: true });
});
app.post('/api/messages/:id/react', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m || !canSee(req, m)) return err(res, 'Not found', 404);
  const emoji = String(req.body.emoji || '').slice(0, 16); if (!emoji) return err(res, 'No emoji');
  const has = db.prepare('SELECT 1 FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').get(m.id, req.user.id, emoji);
  if (has) db.prepare('DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').run(m.id, req.user.id, emoji);
  else db.prepare('INSERT INTO reactions VALUES(?,?,?)').run(m.id, req.user.id, emoji);
  const full = hydrateMessage(db.prepare('SELECT * FROM messages WHERE id=?').get(m.id)); broadcastMessage(m, 'message:update', full); res.json(full);
});
app.post('/api/read', auth, (req, res) => {
  db.prepare('INSERT INTO reads VALUES(?,?,?) ON CONFLICT(user_id,target_id) DO UPDATE SET last_read=excluded.last_read').run(req.user.id, String(req.body.target_id), now());
  res.json({ ok: true });
});

// DMs & group DMs
function listDms(uid) {
  return db.prepare('SELECT d.* FROM dms d JOIN dm_members m ON m.dm_id=d.id WHERE m.user_id=?').all(uid).map((d) => ({
    ...d, is_group: !!d.is_group,
    members: db.prepare('SELECT u.* FROM users u JOIN dm_members m ON m.user_id=u.id WHERE m.dm_id=?').all(d.id).map(publicUser),
    last_at: db.prepare('SELECT MAX(created_at) t FROM messages WHERE dm_id=?').get(d.id).t || d.created_at,
  })).sort((a, b) => b.last_at - a.last_at);
}
function openDm(a, b) {
  const ex = db.prepare(`SELECT d.id FROM dms d JOIN dm_members x ON x.dm_id=d.id AND x.user_id=? JOIN dm_members y ON y.dm_id=d.id AND y.user_id=? WHERE d.is_group=0`).get(a, b);
  if (ex) return ex;
  const did = id();
  db.prepare('INSERT INTO dms(id,is_group,created_at) VALUES(?,0,?)').run(did, now());
  db.prepare('INSERT INTO dm_members VALUES(?,?)').run(did, a); db.prepare('INSERT INTO dm_members VALUES(?,?)').run(did, b);
  for (const u of [a, b]) { io.in('user:' + u).socketsJoin('dm:' + did); io.to('user:' + u).emit('dm:update', listDms(u).find((d) => d.id === did)); }
  return { id: did };
}
app.post('/api/dms', auth, (req, res) => {
  const ids = [...new Set((req.body.user_ids || []).filter((x) => x !== req.user.id && getUser(x)))];
  if (!ids.length) return err(res, 'Pick at least one person');
  if (ids.length === 1 && !req.body.group) return res.json(listDms(req.user.id).find((d) => d.id === openDm(req.user.id, ids[0]).id));
  if (ids.length > 9) return err(res, 'Group DMs hold up to 10 people');
  const did = id();
  db.prepare('INSERT INTO dms(id,name,is_group,owner_id,created_at) VALUES(?,?,1,?,?)').run(did, String(req.body.name || '').slice(0, 50) || null, req.user.id, now());
  for (const u of [req.user.id, ...ids]) db.prepare('INSERT INTO dm_members VALUES(?,?)').run(did, u);
  for (const u of [req.user.id, ...ids]) io.to('user:' + u).emit('dm:update', listDms(u).find((d) => d.id === did));
  createMessage({ dm_id: did, author_id: req.user.id, content: `_created the group_` });
  res.json(listDms(req.user.id).find((d) => d.id === did));
});
app.patch('/api/dms/:id', auth, (req, res) => {
  if (!inDm(req.params.id, req.user.id)) return err(res, 'No access', 403);
  if ('name' in req.body) db.prepare('UPDATE dms SET name=? WHERE id=? AND is_group=1').run(String(req.body.name).slice(0, 50), req.params.id);
  if ('icon' in req.body) db.prepare('UPDATE dms SET icon=? WHERE id=? AND is_group=1').run(req.body.icon, req.params.id);
  for (const uid of req.body.add || []) if (getUser(uid)) db.prepare('INSERT OR IGNORE INTO dm_members VALUES(?,?)').run(req.params.id, uid);
  for (const r of db.prepare('SELECT user_id FROM dm_members WHERE dm_id=?').all(req.params.id)) io.to('user:' + r.user_id).emit('dm:update', listDms(r.user_id).find((d) => d.id === req.params.id));
  res.json({ ok: true });
});
app.post('/api/dms/:id/leave', auth, (req, res) => {
  db.prepare('DELETE FROM dm_members WHERE dm_id=? AND user_id=?').run(req.params.id, req.user.id);
  for (const r of db.prepare('SELECT user_id FROM dm_members WHERE dm_id=?').all(req.params.id)) io.to('user:' + r.user_id).emit('dm:update', listDms(r.user_id).find((d) => d.id === req.params.id));
  res.json({ ok: true });
});

// friends
function listFriends(uid) {
  const rows = db.prepare('SELECT * FROM friends WHERE user_id=? OR friend_id=?').all(uid, uid);
  return rows.map((r) => { const other = r.user_id === uid ? r.friend_id : r.user_id;
    return { user: publicUser(getUser(other)), status: r.status === 'accepted' ? 'friend' : (r.user_id === uid ? 'outgoing' : 'incoming') }; })
    .concat(db.prepare('SELECT blocked_id FROM blocks WHERE user_id=?').all(uid).map((b) => ({ user: publicUser(getUser(b.blocked_id)), status: 'blocked' })));
}
const pushFriends = (...uids) => uids.forEach((u) => io.to('user:' + u).emit('friends:update', listFriends(u)));
app.post('/api/friends', auth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=? AND is_bot=0').get(String(req.body.username || '').toLowerCase().replace(/^@/, ''));
  if (!u) return err(res, 'No user with that username');
  if (u.id === req.user.id) return err(res, 'That is you!');
  const incoming = db.prepare('SELECT * FROM friends WHERE user_id=? AND friend_id=?').get(u.id, req.user.id);
  if (incoming) db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?").run(u.id, req.user.id);
  else db.prepare("INSERT OR IGNORE INTO friends VALUES(?,?,'pending',?)").run(req.user.id, u.id, now());
  pushFriends(req.user.id, u.id); res.json({ ok: true });
});
app.post('/api/friends/:uid/:action', auth, (req, res) => {
  const a = req.user.id, b = req.params.uid;
  if (req.params.action === 'accept') db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?").run(b, a);
  if (['remove', 'decline', 'block'].includes(req.params.action)) db.prepare('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').run(a, b, b, a);
  if (req.params.action === 'block') db.prepare('INSERT OR IGNORE INTO blocks VALUES(?,?)').run(a, b);
  if (req.params.action === 'unblock') db.prepare('DELETE FROM blocks WHERE user_id=? AND blocked_id=?').run(a, b);
  pushFriends(a, b); res.json({ ok: true });
});

// no-code bots
app.post('/api/bots', auth, (req, res) => {
  if (req.user.is_bot) return err(res, 'Bots cannot make bots');
  if (db.prepare('SELECT COUNT(*) n FROM users WHERE bot_owner=?').get(req.user.id).n >= 10) return err(res, 'Up to 10 bots per person');
  const name = String(req.body.name || '').trim().slice(0, 32); if (!name) return err(res, 'Name your bot');
  let username = name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'bot'; while (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) username += Math.floor(Math.random() * 10);
  const bid = id();
  db.prepare('INSERT INTO users(id,username,display_name,avatar,bio,banner_color,is_bot,bot_owner,bot_token,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)')
    .run(bid, username, name, req.body.avatar || null, String(req.body.bio || ''), '#7c3aed', req.user.id, crypto.randomBytes(24).toString('hex'), now());
  for (const c of req.body.commands || []) if (c.trigger && c.response) db.prepare('INSERT OR REPLACE INTO bot_commands VALUES(?,?,?)').run(bid, String(c.trigger).slice(0, 40), String(c.response).slice(0, 2000));
  res.json({ ...publicUser(getUser(bid)), commands: db.prepare('SELECT trigger,response FROM bot_commands WHERE bot_id=?').all(bid) });
});
app.patch('/api/bots/:id', auth, (req, res) => {
  const b = db.prepare('SELECT * FROM users WHERE id=? AND bot_owner=?').get(req.params.id, req.user.id); if (!b) return err(res, 'Not your bot', 404);
  for (const k of ['display_name', 'avatar', 'bio']) if (k in req.body) db.prepare(`UPDATE users SET ${k}=? WHERE id=?`).run(req.body[k], b.id);
  if (req.body.commands) { db.prepare('DELETE FROM bot_commands WHERE bot_id=?').run(b.id);
    for (const c of req.body.commands) if (c.trigger && c.response) db.prepare('INSERT OR REPLACE INTO bot_commands VALUES(?,?,?)').run(b.id, String(c.trigger).slice(0, 40), String(c.response).slice(0, 2000)); }
  res.json({ ok: true });
});
app.delete('/api/bots/:id', auth, (req, res) => { db.prepare('DELETE FROM users WHERE id=? AND bot_owner=?').run(req.params.id, req.user.id); res.json({ ok: true }); });
app.post('/api/bots/:id/add/:server', auth, (req, res) => {
  const b = db.prepare('SELECT * FROM users WHERE id=? AND bot_owner=?').get(req.params.id, req.user.id); if (!b) return err(res, 'Not your bot', 404);
  if (!canManage(req.params.server, req.user.id)) return err(res, 'You need to be an admin of that server', 403);
  joinServer(req.params.server, b.id, 'bot'); res.json({ ok: true });
});
app.get('/api/bots/:id/token', auth, (req, res) => {
  const b = db.prepare('SELECT bot_token FROM users WHERE id=? AND bot_owner=?').get(req.params.id, req.user.id); if (!b) return err(res, 'Not your bot', 404);
  res.json({ token: b.bot_token });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- realtime ----------
io.use((socket, next) => {
  const s = db.prepare('SELECT user_id FROM sessions WHERE token=?').get(socket.handshake.auth?.token || '');
  if (!s) return next(new Error('unauthorized'));
  socket.user = getUser(s.user_id); next();
});
io.on('connection', (socket) => {
  const uid = socket.user.id;
  socket.join('user:' + uid);
  for (const r of db.prepare('SELECT server_id FROM members WHERE user_id=?').all(uid)) socket.join('server:' + r.server_id);
  const was = online.get(uid) || 0; online.set(uid, was + 1);
  if (!was) io.emit('presence', { user_id: uid, online: true });
  socket.on('typing', ({ channel_id, dm_id }) => {
    const payload = { user_id: uid, name: socket.user.display_name, channel_id, dm_id };
    if (channel_id) { const ch = channel(channel_id); if (ch && isMember(ch.server_id, uid)) socket.to('server:' + ch.server_id).emit('typing', payload); }
    else if (dm_id && inDm(dm_id, uid)) for (const r of db.prepare('SELECT user_id FROM dm_members WHERE dm_id=? AND user_id<>?').all(dm_id, uid)) io.to('user:' + r.user_id).emit('typing', payload);
  });
  socket.on('disconnect', () => {
    const n = (online.get(uid) || 1) - 1;
    if (n <= 0) { online.delete(uid); io.emit('presence', { user_id: uid, online: false }); } else online.set(uid, n);
  });
});

server.listen(PORT, () => console.log(`Zuno running on http://localhost:${PORT}`));
