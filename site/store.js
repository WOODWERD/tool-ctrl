// The record on this device (TC-R96): one IndexedDB row per box, compartment and item, so a change saves only what changed.
const DB = 'tool-ctrl', VERSION = 1, STORES = ['containers', 'compartments', 'items', 'meta'];
const KEYS = { containers: 'id', compartments: 'id', items: 'uid' };

let db = null;
function open() {
  if (db) return Promise.resolve(db);
  return new Promise((ok, fail) => {
    const rq = indexedDB.open(DB, VERSION);
    rq.onupgradeneeded = () => { for (const s of STORES) if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s, s === 'meta' ? undefined : { keyPath: KEYS[s] }); };
    rq.onsuccess = () => { db = rq.result; ok(db); };
    rq.onerror = () => fail(rq.error);
  });
}
const done = (tx) => new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = tx.onabort = () => fail(tx.error); });
const all = (store) => new Promise((ok, fail) => { const rq = store.getAll(); rq.onsuccess = () => ok(rq.result); rq.onerror = () => fail(rq.error); });

export async function loadRecord() {
  const d = await open();
  const tx = d.transaction(STORES, 'readonly');
  const [containers, compartments, items] = await Promise.all(['containers', 'compartments', 'items'].map((s) => all(tx.objectStore(s))));
  const meta = await new Promise((ok) => { const rq = tx.objectStore('meta').get('meta'); rq.onsuccess = () => ok(rq.result || null); rq.onerror = () => ok(null); });
  return meta ? { meta, containers, compartments, items } : null;
}

// changed: { containers: [ids], compartments: [ids], items: [uids], removed: {store: [keys]} }, or 'all'
export async function saveRecord(rec, changed = 'all') {
  const d = await open();
  const tx = d.transaction(STORES, 'readwrite');
  const put = (s, rows) => { const st = tx.objectStore(s); for (const r of rows) st.put(r); };
  if (changed === 'all') {
    for (const s of ['containers', 'compartments', 'items']) { tx.objectStore(s).clear(); put(s, rec[s]); }
  } else {
    for (const s of ['containers', 'compartments', 'items']) {
      const keys = new Set(changed[s] || []);
      if (keys.size) put(s, rec[s].filter((r) => keys.has(r[KEYS[s]])));
      for (const k of changed.removed?.[s] || []) tx.objectStore(s).delete(k);
    }
  }
  tx.objectStore('meta').put(rec.meta, 'meta');
  return done(tx);
}

// Sync state: the record as last synced and GitHub's version of it. Kept beside the record, never in it or a backup.
export async function loadSync() {
  const d = await open();
  return new Promise((ok) => { const rq = d.transaction('meta').objectStore('meta').get('sync'); rq.onsuccess = () => ok(rq.result || null); rq.onerror = () => ok(null); });
}
export async function saveSync(s) {
  const d = await open();
  const tx = d.transaction('meta', 'readwrite');
  if (s) tx.objectStore('meta').put(s, 'sync'); else tx.objectStore('meta').delete('sync');
  return done(tx);
}

// TC-S06: how full this browser's storage is, when it will say
export async function storageUse() {
  try { const e = await navigator.storage.estimate(); return e.quota ? e.usage / e.quota : 0; } catch { return 0; }
}
export async function askToKeep() { try { return await navigator.storage.persist(); } catch { return false; } }
