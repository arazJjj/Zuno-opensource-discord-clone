// Zuno database. With TURSO_URL + TURSO_TOKEN set, data lives permanently in Turso
// (libSQL embedded replica: reads are local, writes go to Turso). Otherwise a local file.
const path = require('path');
const strip = r => { if (r && typeof r === 'object') delete r._metadata; return r; };
module.exports = function openDb(dataDir) {
  const url = process.env.TURSO_URL, token = process.env.TURSO_TOKEN;
  let db;
  if (url && token) {
    const Database = require('libsql');
    db = new Database(path.join(dataDir, 'zuno-replica.db'), { syncUrl: url, authToken: token, readYourWrites: true });
    db.sync();
    setInterval(() => { try { db.sync(); } catch (e) { console.error('turso sync', e.message); } }, 60000).unref();
    console.log('Zuno storage: Turso (permanent)');
  } else {
    let Database;
    try { Database = require('better-sqlite3'); } catch { Database = require('libsql'); }
    db = new Database(path.join(dataDir, 'zuno.db'));
    try { db.pragma('journal_mode = WAL'); } catch {}
    console.log('Zuno storage: local file (resets on redeploy)');
  }
  try { db.pragma('foreign_keys = ON'); } catch {}
  const prep = db.prepare.bind(db);
  db.prepare = sql => {
    const s = prep(sql);
    const get = s.get.bind(s), all = s.all.bind(s);
    s.get = (...a) => strip(get(...a));
    s.all = (...a) => all(...a).map(strip);
    return s;
  };
  return db;
};
