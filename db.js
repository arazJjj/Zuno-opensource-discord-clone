// Zuno database.
// The app always reads and writes a fast local SQLite file. When TURSO_URL + TURSO_TOKEN are set,
// every write is also copied to Turso in the background, and on startup the local file is
// refilled from Turso. So accounts, servers and chats survive redeploys on free hosting.
const path = require('path');
const Database = require('better-sqlite3');

module.exports = function openDb(dataDir) {
  const db = new Database(path.join(dataDir, 'zuno.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const url = process.env.TURSO_URL, token = process.env.TURSO_TOKEN;
  if (!url || !token) {
    console.log('Zuno storage: local file only (resets on redeploy)');
    db.ready = async () => {};
    return db;
  }
  const { createClient } = require('@libsql/client');
  const remote = createClient({ url, authToken: token });
  const queue = [];
  let restoring = true, flushing = false;
  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const toArgs = (a) => {
    if (a.length === 1 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) && !Buffer.isBuffer(a[0])) {
      const o = {}; for (const [k, v] of Object.entries(a[0])) o[k] = norm(v); return o;
    }
    return a.flat().map(norm);
  };
  const exec = db.exec.bind(db);
  db.exec = (sql) => { const r = exec(sql); queue.push({ multi: sql }); kick(); return r; };
  const prep = db.prepare.bind(db);
  db.prepare = (sql) => {
    const s = prep(sql);
    if (!s.reader) { const run = s.run.bind(s); s.run = (...a) => { const r = run(...a); queue.push({ sql, args: toArgs(a) }); kick(); return r; }; }
    return s;
  };
  async function sendOne(q) {
    try { if (q.multi) await remote.executeMultiple(q.multi); else await remote.execute(q); }
    catch (e) {
      const msg = String(e.message || e);
      if (/fetch failed|ECONN|ETIMEDOUT|network|socket|50\d|429/i.test(msg)) throw e; // retry later
      if (!/duplicate column|already exists|UNIQUE constraint/i.test(msg)) console.error('turso skip:', msg.slice(0, 160));
    }
  }
  async function flush() {
    if (flushing) return; flushing = true;
    try {
      while (queue.length) {
        const q = queue[0];
        try { await sendOne(q); queue.shift(); }
        catch (e) { console.error('turso retry:', String(e.message).slice(0, 120)); await new Promise((r) => setTimeout(r, 3000)); }
      }
    } finally { flushing = false; }
  }
  function kick() { if (!restoring) setImmediate(flush); }
  const timer = setInterval(() => { if (!restoring) flush(); }, 5000); timer.unref();

  db.ready = async () => {
    // 1) bring Turso's tables up to date with this version's schema (+ seed rows)
    for (let i = 0; i < 5; i++) { try { await flush(); break; } catch {} }
    // 2) refill the local file from Turso
    const tables = prep("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
    let total = 0;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const data = {};
        for (const t of tables) data[t] = (await remote.execute(`SELECT * FROM "${t}"`));
        db.pragma('foreign_keys = OFF');
        db.transaction(() => {
          for (const t of tables) {
            const rs = data[t]; if (!rs.rows.length) continue;
            const localCols = new Set(prep(`PRAGMA table_info("${t}")`).all().map((c) => c.name));
            const cols = rs.columns.filter((c) => localCols.has(c));
            const ins = prep(`INSERT OR REPLACE INTO "${t}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
            for (const row of rs.rows) { ins.run(cols.map((c) => { const v = row[c]; return typeof v === 'bigint' ? Number(v) : v instanceof ArrayBuffer ? Buffer.from(v) : v; })); total++; }
          }
        })();
        db.pragma('foreign_keys = ON');
        console.log(`Zuno storage: Turso (permanent), restored ${total} rows`);
        break;
      } catch (e) {
        console.error(`turso restore attempt ${attempt} failed:`, e.message);
        if (attempt === 5) console.error('Starting without restore; writes will still be saved to Turso.');
        else await new Promise((r) => setTimeout(r, 3000));
      }
    }
    restoring = false; flush();
  };
  return db;
};
