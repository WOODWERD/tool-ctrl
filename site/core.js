// Tool Ctrl rules. No page code here: everything in this file is tested by TC-A ID.

export const LIMITS = { name: 20, kind: 28, serial: 40, compName: 20, prefix: 4, id: 12, qty: 999, compN: 99, number: 999 };
export const COMP_TYPES = { D: 'Drawer', T: 'Tray', B: 'Bin' };
export const TIERS = ['Power', 'Hand', 'Consumable'];
export const KINDS_OF_BOX = ['Systainer', 'Sortainer', 'Systainer drawer unit', 'Packout', 'TSTAK', 'Tool chest', 'Bag', 'Bin'];
export const PHONE_MAX = 767; // TC-R100: under 768 px is a phone
export const SOON_DAYS = 90; // TC-R84
export const BACKUP_EVERY = 20; // TC-E04
export const BOX_LINE = 40; // Box Ctrl contents line (BX-R30)
export const BOX_MAKERS = ['Festool', 'Milwaukee', 'DEWALT', 'Bosch', 'Makita', 'Wera', 'Knipex'];

// ---------- the record ----------
export function emptyRecord(owner = '', prefix = '') {
  return { meta: { owner, prefix, prefixes: prefix ? [prefix] : [], counters: {}, kinds: [...KINDS_OF_BOX], itemSeq: 0, changes: 0, lastBackup: null }, containers: [], compartments: [], items: [] };
}

// ---------- numbering (TC-R01 to TC-R08) ----------
const pad = (n) => String(n).padStart(3, '0');
export const formatId = (prefix, n) => `${prefix}-${pad(n)}`;
export const compId = (cid, type, n) => `${cid}-${type}${n}`;

export function parseId(id) {
  const m = /^([A-Z]{1,4})-(\d{3})(?:-([DTB])(\d{1,2}))?$/.exec(String(id).trim().toUpperCase());
  if (!m) return null;
  return { prefix: m[1], n: +m[2], container: `${m[1]}-${m[2]}`, comp: m[3] ? { type: m[3], n: +m[4] } : null };
}

// TC-R02a, TC-R08, TC-E11
export function prefixError(p) {
  const v = String(p).trim();
  if (!v) return 'Enter a prefix of 1 to 4 capital letters.';
  if (!/^[A-Z]+$/.test(v)) return 'A prefix uses capital letters only, such as WW.';
  if (v.length > LIMITS.prefix) return `${v} is ${v.length} letters. Keep it to 4, so every ID fits Box Ctrl's 12 characters.`;
  return '';
}
export const suggestPrefix = (owner) => {
  const words = String(owner).toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : words[0].slice(0, 2);
};

// TC-R03, TC-R04: the next number after the highest ever used with that prefix. Retired IDs still count.
export function nextNumber(rec, prefix) {
  let hi = rec.meta.counters[prefix] || 0;
  for (const c of rec.containers) if (c.prefix === prefix && c.n > hi) hi = c.n;
  return hi + 1;
}
export const nextId = (rec, prefix = rec.meta.prefix) => formatId(prefix, nextNumber(rec, prefix));

// ---------- containers and compartments (TC-R10 to TC-R14) ----------
export const getC = (rec, id) => rec.containers.find((c) => c.id === id);
export const getComp = (rec, id) => rec.compartments.find((c) => c.id === id);
export const compsOf = (rec, cid) => rec.compartments.filter((c) => c.containerId === cid).sort((a, b) => a.type.localeCompare(b.type) || a.n - b.n);
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export function addContainer(rec, f = {}) {
  const prefix = f.prefix || rec.meta.prefix;
  const n = f.n || nextNumber(rec, prefix);
  if (n > LIMITS.number) throw new Error(`${prefix} has used all 999 numbers. Add another prefix in Record.`);
  const id = formatId(prefix, n);
  if (getC(rec, id)) throw new Error(`${id} is already used.`);
  const c = {
    id, prefix, n, kindOfBox: f.kindOfBox || 'Systainer', name: clip(f.name, LIMITS.name), kind: clip(f.kind, LIMITS.kind),
    location: clip(f.location, 40), sitsOn: '', notes: f.notes || '', status: 'active', kept: f.kept || {}, cmax: { D: 0, T: 0, B: 0 },
  };
  rec.containers.push(c);
  rec.meta.counters[prefix] = Math.max(rec.meta.counters[prefix] || 0, n);
  return c;
}

// TC-R07: a hand-changed ID is refused if it is taken; the caller confirms first
export function renameContainer(rec, oldId, newId) {
  const p = parseId(newId);
  if (!p || p.comp) return 'Use the form WW-014.';
  if (getC(rec, p.container)) return `${p.container} is already used.`;
  const c = getC(rec, oldId);
  c.id = p.container; c.prefix = p.prefix; c.n = p.n;
  rec.meta.counters[p.prefix] = Math.max(rec.meta.counters[p.prefix] || 0, p.n);
  for (const k of rec.compartments.filter((x) => x.containerId === oldId)) { k.containerId = c.id; const was = k.id; k.id = compId(c.id, k.type, k.n); retarget(rec, was, k.id); }
  retarget(rec, oldId, c.id);
  for (const o of rec.containers) if (o.sitsOn === oldId) o.sitsOn = c.id;
  return '';
}
function retarget(rec, from, to) { for (const it of rec.items) if (it.place === from) it.place = to; }

// TC-R11: adding drawers makes them in one step, never renumbering old ones (TC-E03)
export function addCompartments(rec, cid, type = 'D', count = 1, names = []) {
  const c = getC(rec, cid);
  const made = [];
  for (let i = 0; i < count; i++) {
    const n = (c.cmax[type] || 0) + 1;
    if (n > LIMITS.compN) break;
    c.cmax[type] = n;
    const k = { id: compId(cid, type, n), containerId: cid, type, n, name: clip(names[i], LIMITS.compName), notes: '' };
    rec.compartments.push(k); made.push(k);
  }
  return made;
}

// TC-R13: no loops
export function sitsOnError(rec, cid, target) {
  if (!target) return '';
  if (target === cid) return "A box can't sit on itself.";
  if (!getC(rec, target)) return `There is no ${target}.`;
  for (let t = target, guard = 0; t && guard < 500; guard++) { if (t === cid) return `${target} already sits on ${cid}.`; t = getC(rec, t)?.sitsOn; }
  return '';
}
export function setSitsOn(rec, cid, target) {
  const e = sitsOnError(rec, cid, target);
  if (!e) getC(rec, cid).sitsOn = target || '';
  return e;
}

// TC-R13: location follows what a box sits on. Returns the chain outermost first.
export function whereIs(rec, cid) {
  const chain = []; let c = getC(rec, cid), guard = 0;
  while (c && c.sitsOn && guard++ < 50) { const up = getC(rec, c.sitsOn); if (!up) break; chain.unshift(up.id); c = up; }
  return { location: c ? c.location : '', via: chain };
}
export const locationOf = (rec, cid) => whereIs(rec, cid).location;

// TC-R12, TC-R14: retiring keeps the ID; removing asks where items go
export function retireContainer(rec, cid, moveItemsTo = null, today = isoToday()) {
  const c = getC(rec, cid);
  const loc = locationOf(rec, cid);
  c.status = 'retired';
  for (const o of rec.containers) if (o.sitsOn === cid) { o.sitsOn = ''; if (!o.location) o.location = loc; }
  if (moveItemsTo !== false) moveItems(rec, itemsIn(rec, cid, true).map((i) => i.uid), moveItemsTo, today);
}

// ---------- items (TC-R20 to TC-R26) ----------
// A short random tail keeps two devices adding tools offline from picking the same ID (TC-R66)
const tail = () => { const a = new Uint8Array(3); globalThis.crypto.getRandomValues(a); return [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 4); };
export function newUid(rec) { rec.meta.itemSeq += 1; return 'i' + rec.meta.itemSeq.toString(36) + tail(); }
export function addItem(rec, f = {}) {
  const tier = TIERS.includes(f.tier) ? f.tier : 'Power';
  const it = {
    uid: newUid(rec), name: clip(f.name, 60), brand: clip(f.brand, 30), kind: clip(f.kind, LIMITS.kind), tier,
    qty: tier === 'Consumable' ? null : clampQty(f.qty), place: f.place || null, looseAt: f.looseAt || '', notes: f.notes || '',
    source: f.source || 'Typed', status: 'active', history: [], warranty: tier === 'Consumable' ? null : (f.warranty || null),
  };
  rec.items.push(it);
  return it;
}
export const clampQty = (q) => { const n = parseInt(q, 10); return isFinite(n) ? Math.min(LIMITS.qty, Math.max(1, n)) : 1; };
export const getItem = (rec, uid) => rec.items.find((i) => i.uid === uid);

// Items in a box: its own, plus its compartments' when deep
export function itemsIn(rec, place, deep = false) {
  const places = new Set([place]);
  if (deep) for (const k of rec.compartments) if (k.containerId === place) places.add(k.id);
  return rec.items.filter((i) => i.status === 'active' && places.has(i.place));
}

// TC-R24, TC-R95: moves keep a history line, and hand back what Undo needs
export function moveItems(rec, uids, to, date = isoToday()) {
  const undo = [];
  for (const uid of uids) {
    const it = getItem(rec, uid);
    if (!it || it.place === to) continue;
    undo.push({ uid, place: it.place, history: it.history.length });
    it.history.push({ from: it.place || 'Loose', to: to || 'Loose', date });
    it.place = to || null;
  }
  return undo;
}
export function undoMove(rec, undo) {
  for (const u of undo) { const it = getItem(rec, u.uid); if (it) { it.place = u.place; it.history.length = u.history; } }
}

// TC-R82: warranty details belong to one tool
export function splitOne(rec, uid) {
  const it = getItem(rec, uid);
  if (!it || !it.qty || it.qty < 2) return it;
  it.qty -= 1;
  const one = addItem(rec, { ...it, qty: 1, warranty: null, source: it.source });
  one.history = []; one.place = it.place;
  return one;
}

// TC-R27: a catalog tool in a box of its own, with the next free number
const TIER_OF = { power: 'Power', hand: 'Hand', consumable: 'Consumable' };
export function toolInNewBox(rec, t, { kindOfBox = 'Systainer', location = '' } = {}) {
  const box = addContainer(rec, { name: t.name.toUpperCase(), kind: t.kind, kindOfBox, location });
  const tier = TIER_OF[t.tier] || 'Power';
  const items = [addItem(rec, { name: t.name, brand: t.brand, kind: t.kind, tier, place: box.id, source: 'Catalog' }),
    ...[t.c1, t.c2].filter(Boolean).map((line) => addItem(rec, { name: line, tier, place: box.id, source: 'Catalog' }))];
  return { box, items };
}
// TC-R29: tools already recorded that could move here, Loose first
export function myTools(rec, place, q = '') {
  const w = words(q);
  return rec.items.filter((i) => i.status === 'active' && i.place !== (place || null) && w.every((x) => `${i.name} ${i.brand} ${i.kind}`.toLowerCase().includes(x)))
    .sort((a, b) => (!!a.place - !!b.place) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
// TC-R29 with TC-R27: a recorded tool moved into a box of its own
export function itemInNewBox(rec, uid, { kindOfBox = 'Systainer', location = '' } = {}, date = isoToday()) {
  const it = getItem(rec, uid);
  const box = addContainer(rec, { name: it.name.toUpperCase(), kind: it.kind, kindOfBox, location });
  const undo = moveItems(rec, [uid], box.id, date);
  return { box, undo };
}

// TC-R28: take back a box made moments ago, and its number if it was the highest
export function removeNewBox(rec, id) {
  const p = parseId(id);
  rec.items = rec.items.filter((i) => !(i.place === id || rec.compartments.some((k) => k.containerId === id && k.id === i.place)));
  rec.compartments = rec.compartments.filter((k) => k.containerId !== id);
  rec.containers = rec.containers.filter((c) => c.id !== id);
  if (p && rec.meta.counters[p.prefix] === p.n) rec.meta.counters[p.prefix] = Math.max(0, ...rec.containers.filter((c) => c.prefix === p.prefix).map((c) => c.n));
}

// ---------- read from photo (TC-R31 to TC-R35) ----------
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const compact = (s) => norm(s).replace(/ /g, '');
const pairs = (s) => { const t = compact(s), out = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; };
function dice(a, b) {
  const x = pairs(a), y = pairs(b); if (!x.length || !y.length) return 0;
  const m = new Map(); for (const p of y) m.set(p, (m.get(p) || 0) + 1);
  let hit = 0; for (const p of x) if (m.get(p)) { hit++; m.set(p, m.get(p) - 1); }
  return (2 * hit) / (x.length + y.length);
}
// Lines of text read from a photo become suggestions: a catalog match (ticked), a guess (unticked), or already here.
// candidates: catalog entries { name, brand, kind, tier }. Nothing is added here; the person confirms (TC-R32).
export function suggestFromText(rec, place, lines, candidates, brands = BOX_MAKERS) {
  const out = [], seen = new Set();
  const brandWords = new Set(brands.map((b) => compact(b)));
  for (const raw of lines) {
    const line = String(raw).replace(/\s+/g, ' ').trim();
    const L = compact(line), words = new Set(norm(line).split(' '));
    if (L.replace(/[^A-Z0-9]/g, '').length < 3 || brandWords.has(L) || !/[A-Z]/.test(L)) continue;
    let best = null, score = 0;
    for (const cand of candidates) {
      const C = compact(cand.name);
      if (C.length < 3) continue;
      const cw = norm(cand.name).split(' ').filter((w) => w.length > 1);
      let s = 0;
      if (L.includes(C)) s = 2 + C.length; // the model name appears in what was read
      else if (cw.length > 1 && cw.every((w) => words.has(w))) s = 1 + C.length; // every word of a generic name
      else { const d = dice(line, cand.name); if (d >= 0.8) s = d; }
      if (s > score) { score = s; best = cand; }
    }
    const key = best ? `${best.brand}|${best.name}` : `?|${L}`;
    if (seen.has(key)) continue; seen.add(key);
    if (best) {
      const here = alreadyIn(rec, place, best.name, best.brand);
      out.push({ name: best.name, brand: best.brand || '', kind: best.kind || '', tier: best.tier || 'power', c1: best.c1 || '', c2: best.c2 || '', read: line, status: here ? 'here' : 'match', on: !here });
    } else {
      const name = line.slice(0, 60);
      out.push({ name, brand: '', kind: '', tier: 'hand', read: line, status: alreadyIn(rec, place, name) ? 'here' : 'guess', on: false });
    }
  }
  const rank = { match: 0, guess: 1, here: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status]);
}

// TC-R35: a suggestion or tick for something already in that place
export const alreadyIn = (rec, place, name, brand = '') =>
  itemsIn(rec, place).some((i) => i.name.toLowerCase() === String(name).toLowerCase() && (!brand || !i.brand || i.brand.toLowerCase() === brand.toLowerCase()));

// ---------- paths (TC-R41) ----------
export function placeParts(rec, place, looseAt = '') {
  if (!place) return { location: looseAt, via: [], box: '', comp: '', label: 'Loose' };
  const k = getComp(rec, place);
  const cid = k ? k.containerId : place;
  const w = whereIs(rec, cid);
  return { location: w.location, via: w.via, box: cid, comp: k ? `${k.type}${k.n}` : '', label: k ? k.id : cid };
}
export function pathText(rec, it) {
  const p = placeParts(rec, it.place, it.looseAt);
  return [p.location, ...p.via, p.box, p.comp, it.name].filter(Boolean).join(' › ') || `Loose › ${it.name}`;
}

// ---------- search, filter, group (TC-R40, TC-R93, TC-R94) ----------
const words = (q) => String(q).toLowerCase().split(/\s+/).filter(Boolean);
export function itemText(rec, it) {
  const p = placeParts(rec, it.place, it.looseAt);
  return `${it.name} ${it.brand} ${it.kind} ${it.notes} ${it.warranty?.serial || ''} ${p.label} ${p.location} ${p.via.join(' ')}`.toLowerCase();
}
export const containerText = (rec, c) => `${c.id} ${c.name} ${c.kind} ${c.kindOfBox} ${locationOf(rec, c.id)} ${c.notes}`.toLowerCase();

export function search(rec, q) {
  const w = words(q);
  const match = (t) => w.every((x) => t.includes(x));
  const containers = w.length ? rec.containers.filter((c) => match(containerText(rec, c))) : rec.containers.slice();
  const items = rec.items.filter((i) => i.status === 'active' && (!w.length || match(itemText(rec, i))));
  return { containers, items };
}

export function filterItems(rec, items, f = {}) {
  return items.filter((i) => (!f.tier || i.tier === f.tier)
    && (!f.location || placeParts(rec, i.place, i.looseAt).location === f.location)
    && (!f.brand || i.brand === f.brand)
    && (!f.warranty || warrantyStatus(i.warranty) === f.warranty));
}

export const GROUP_BY = { box: 'Box', location: 'Location', brand: 'Brand', tier: 'Tier' };
export function groupItems(rec, items, by = 'box', sort = 'name') {
  const key = (i) => {
    const p = placeParts(rec, i.place, i.looseAt);
    if (by === 'location') return p.location || 'No location';
    if (by === 'brand') return i.brand || 'No brand';
    if (by === 'tier') return i.tier;
    return i.place ? (getC(rec, p.box) ? `${p.label} · ${getComp(rec, i.place)?.name || getC(rec, p.box).name}` : p.label) : `Loose${i.looseAt ? ' · ' + i.looseAt : ''}`;
  };
  const m = new Map();
  for (const i of items) { const k = key(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
  const cmp = sort === 'brand' ? (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([name, rows]) => ({ name, rows: rows.sort(cmp) }));
}

export function groupContainers(rec, list, by = 'location') {
  const key = (c) => by === 'kind' ? c.kindOfBox : by === 'none' ? 'All boxes' : (() => { const w = whereIs(rec, c.id); return w.via.length ? `${w.via[w.via.length - 1]} · ${w.location || 'No location'}` : (w.location || 'No location'); })();
  const m = new Map();
  for (const c of list) { const k = key(c); if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, rows]) => ({ name, rows: rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) }));
}

// ---------- warranty (TC-R80 to TC-R87) ----------
export function isoToday(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export function addYears(iso, years) {
  const d = parseDate(iso); if (!d) return '';
  const y = d.getFullYear() + Math.floor(years), m = d.getMonth(), day = d.getDate();
  const last = new Date(y, m + 1, 0).getDate(); // a Feb 29 purchase ends on Feb 28
  return isoToday(new Date(y, m, Math.min(day, last)));
}
export function warrantyEnd(w) {
  if (!w) return '';
  if (w.end) return w.end; // TC-R81: a typed end date wins
  const y = parseFloat(w.years);
  return w.bought && isFinite(y) && y > 0 ? addYears(w.bought, y) : '';
}
export const hasWarranty = (w) => !!w && Object.values(w).some((v) => v !== '' && v != null && v !== 'unknown');
export function daysLeft(w, today = isoToday()) {
  const e = parseDate(warrantyEnd(w)), t = parseDate(today);
  return e && t ? Math.round((e - t) / 86400000) : null;
}
export function warrantyStatus(w, today = isoToday()) {
  if (!hasWarranty(w)) return 'none';
  const d = daysLeft(w, today);
  if (d == null) return 'noend';
  if (d < 0) return 'ended';
  return d <= SOON_DAYS ? 'soon' : 'active';
}
export const STATUS_TEXT = { active: 'Active', soon: 'Ends within 90 days', ended: 'Ended', noend: 'No end date', none: 'None' };
export function warrantyList(rec, today = isoToday()) {
  return rec.items.filter((i) => i.status === 'active' && hasWarranty(i.warranty)).map((i) => ({ it: i, end: warrantyEnd(i.warranty), status: warrantyStatus(i.warranty, today), days: daysLeft(i.warranty, today) }))
    .sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999'));
}
export function warrantyCounts(rec, today = isoToday()) {
  const l = warrantyList(rec, today);
  return { total: l.length, active: l.filter((x) => x.status === 'active').length, soon: l.filter((x) => x.status === 'soon').length, ended: l.filter((x) => x.status === 'ended').length,
    unregistered: l.filter((x) => x.it.warranty.registered === 'no').length };
}
// TC-R85: everything a claim needs, as plain text
export function warrantyCard(rec, it) {
  const w = it.warranty || {};
  const reg = { yes: 'Yes', no: 'No', 'not-needed': 'Not needed' }[w.registered] || 'Not recorded';
  return [
    `${it.name}${it.kind ? ' · ' + it.kind : ''}${it.brand ? ' · ' + it.brand : ''}`,
    `Serial number: ${w.serial || 'Not recorded'}`,
    `Bought: ${w.bought || 'Not recorded'}${w.seller ? ' from ' + w.seller : ''}`,
    `Price paid: ${w.price || 'Not recorded'}`,
    `Warranty ends: ${warrantyEnd(w) || 'Not recorded'}${w.years ? ` (${w.years} years)` : ''}`,
    `Registered: ${reg}${w.regNo ? ' · ' + w.regNo : ''}`,
    `Receipt: ${w.receipt || 'Not recorded'}`,
    `Where it is now: ${pathText(rec, it)}`,
  ].join('\n');
}

// ---------- devices (TC-R100 to TC-R102) ----------
export const isPhone = (width) => width <= PHONE_MAX;

// ---------- CSV ----------
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}
const cell = (v) => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

// ---------- import (TC-R50, TC-R50a, TC-E01) ----------
const MAKER = { festool: 'Festool', milwaukee: 'Milwaukee', dewalt: 'DEWALT', bosch: 'Bosch', makita: 'Makita', wera: 'Wera', knipex: 'Knipex' };
const tierOf = (t) => ({ power: 'Power', hand: 'Hand', consumable: 'Consumable', consumables: 'Consumable' }[String(t).toLowerCase()] || 'Power');
const KNOWN = ['id', 'name', 'kind', 'contents', 'contents 1', 'contents 2', 'location', 'notes', 'tier', 'palette', 'group', 'kind of box', 'kind_of_box', 'model'];

// Reads a list into a plan; nothing changes until applyImport. renumberTo swaps the prefix and keeps each number;
// closeGaps numbers the renumbered boxes in order with no gaps instead, so ST-200 can follow ST-063 (TC-R50b).
export function planImport(rec, text, { renumberTo = '', kindOfBox = 'Systainer', closeGaps = false } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: 'That file is empty.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  if (col('name') < 0) return { error: 'That file has no Name column.' };
  const kept = head.filter((h) => h && !KNOWN.includes(h));
  const used = new Set(rec.containers.map((c) => c.id));
  const plan = { boxes: [], skipped: [], kept, items: 0, renumbered: [], gaps: false };
  // TC-R50b: the new number for each old ID, in order of the old numbers
  const order = new Map();
  if (renumberTo) {
    const olds = [...new Set(rows.slice(1).map((r) => parseId((r[col('id')] || '').trim())).filter((p) => p && p.prefix !== renumberTo).map((p) => p.container))]
      .sort((a, b) => parseId(a).n - parseId(b).n);
    plan.gaps = olds.some((o, i) => i > 0 && parseId(o).n !== parseId(olds[i - 1]).n + 1);
    let n = nextNumber(rec, renumberTo);
    if (closeGaps) for (const o of olds) { while (used.has(formatId(renumberTo, n))) n++; order.set(o, n++); }
  }
  rows.slice(1).forEach((r, i) => {
    const get = (n) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '');
    const line = i + 2, name = get('name');
    if (!name) { plan.skipped.push({ line, why: 'No name' }); return; }
    if (name.length > LIMITS.name) { plan.skipped.push({ line, why: `Name is ${name.length} characters; the limit is ${LIMITS.name}` }); return; }
    let id = get('id').toUpperCase(), old = '';
    let p = id ? parseId(id) : null;
    if (id && !p) { plan.skipped.push({ line, why: `${id} isn't an ID like WW-014` }); return; }
    if (p && renumberTo && p.prefix !== renumberTo) { old = p.container; p = parseId(formatId(renumberTo, order.get(old) || p.n)); plan.renumbered.push([old, p.container]); }
    if (p && (used.has(p.container) || plan.boxes.some((b) => b.id === p.container))) { plan.skipped.push({ line, why: `${p.container} is already used` }); return; }
    const contents = col('contents') >= 0 ? get('contents').split('|') : [get('contents 1'), get('contents 2')];
    const brand = MAKER[(get('palette') || get('group')).toLowerCase()] || '';
    const tier = tierOf(get('tier'));
    const items = [{ name: get('model') || name, brand, kind: get('kind'), tier }, ...contents.map((x) => x.trim()).filter(Boolean).map((x) => ({ name: x, brand: '', kind: '', tier }))];
    const keptVals = {}; for (const k of kept) keptVals[k] = r[head.indexOf(k)] ?? '';
    plan.boxes.push({ id: p ? p.container : '', prefix: p ? p.prefix : '', n: p ? p.n : 0, name, kind: get('kind'), location: get('location'), notes: [get('notes'), old && `Was ${old}`].filter(Boolean).join(' · '),
      kindOfBox: get('kind of box') || get('kind_of_box') || kindOfBox, kept: keptVals, items });
    plan.items += items.length;
  });
  return plan;
}
export function applyImport(rec, plan) {
  for (const b of plan.boxes) {
    const c = addContainer(rec, { ...b, prefix: b.prefix || rec.meta.prefix, n: b.n || undefined });
    if (!rec.meta.prefixes.includes(c.prefix)) rec.meta.prefixes.push(c.prefix);
    for (const it of b.items) addItem(rec, { ...it, place: c.id, source: 'Typed' });
  }
}

// ---------- export (TC-R51 to TC-R54) ----------
// Whole item names into two lines of 40, never cutting a word. Returns what was left off.
export function packContents(names, width = BOX_LINE) {
  const lines = ['', '']; let li = 0; const left = [];
  for (const n of names) {
    if (n.length > width) { left.push(n); continue; } // too long for any line
    while (li < 2) {
      const next = lines[li] ? `${lines[li]} · ${n}` : n;
      if (next.length <= width) { lines[li] = next; break; }
      li += 1;
    }
    if (li > 1) left.push(n);
  }
  return { c1: lines[0], c2: lines[1], left };
}
function groupFor(items) {
  const maker = items.find((i) => BOX_MAKERS.includes(i.brand));
  if (maker) return maker.brand;
  const t = items[0]?.tier;
  return t === 'Hand' ? 'Hand tools' : t === 'Consumable' ? 'Consumables' : t === 'Power' ? 'Power tools' : 'Other';
}
export function exportBoxCtrl(rec, { compartments = false } = {}) {
  const rows = [['ID', 'Name', 'Kind', 'Contents', 'Group', 'Icon', 'Quantity']], over = [];
  const one = (id, name, kind, items, icon) => {
    const pk = packContents(items.map((i) => i.name));
    if (pk.left.length) over.push({ id, name, total: items.length, left: pk.left.length });
    rows.push([id, name.slice(0, LIMITS.name), kind.slice(0, LIMITS.kind), [pk.c1, pk.c2].filter(Boolean).join('|'), groupFor(items), icon || '', 1]);
  };
  for (const c of rec.containers.filter((x) => x.status === 'active').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
    const ks = compsOf(rec, c.id);
    if (compartments && ks.length) {
      for (const k of ks) one(k.id, k.name || `${c.name} ${k.type}${k.n}`, c.name, itemsIn(rec, k.id), c.kept?.icon);
    } else one(c.id, c.name, c.kind || c.kindOfBox, itemsIn(rec, c.id, true), c.kept?.icon);
  }
  return { csv: toCsv(rows), overruns: over, rows: rows.length - 1 };
}
export function exportItems(rec) {
  const rows = [['Box', 'Compartment', 'Location', 'Name', 'Brand', 'Kind', 'Tier', 'Quantity', 'Notes', 'Serial', 'Bought', 'Seller', 'Price', 'Warranty ends', 'Registered', 'Registration', 'Receipt']];
  for (const i of rec.items.filter((x) => x.status === 'active')) {
    const p = placeParts(rec, i.place, i.looseAt), w = i.warranty || {};
    rows.push([p.box || 'Loose', p.comp ? i.place : '', p.location, i.name, i.brand, i.kind, i.tier, i.qty ?? '', i.notes, w.serial || '', w.bought || '', w.seller || '', w.price || '', warrantyEnd(w), w.registered || '', w.regNo || '', w.receipt || '']);
  }
  return toCsv(rows);
}
export const fileName = (stem, ext, d = new Date()) => `${stem}-${isoToday(d)}.${ext}`;

// TC-R54: the backup holds everything. It never holds a token (TC-R62).
export const BACKUP_KIND = 'tool-ctrl-record';
export const writeBackup = (rec, d = new Date()) => JSON.stringify({ kind: BACKUP_KIND, version: 1, saved: d.toISOString(), record: rec });
export function readBackup(text) {
  let o; try { o = JSON.parse(text); } catch { return { error: "That file isn't a Tool Ctrl backup." }; }
  if (!o || o.kind !== BACKUP_KIND || !o.record || !Array.isArray(o.record.containers) || !Array.isArray(o.record.items)) return { error: "That file isn't a Tool Ctrl backup." };
  const r = o.record;
  r.compartments ||= []; r.meta = { ...emptyRecord().meta, ...r.meta };
  return { record: r };
}

// ---------- sync (TC-R65, TC-R66) ----------
const KINDS = [['containers', 'id'], ['compartments', 'id'], ['items', 'uid']];
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
export const same = (a, b) => stable(a) === stable(b);
const clone = (v) => JSON.parse(JSON.stringify(v));
const byKey = (list, key) => new Map((list || []).map((x) => [x[key], x]));

// What changed between two copies of the record, for the commit message and the waiting count
export function diffRecords(base, cur) {
  const d = { added: {}, changed: {}, removed: {}, boxes: new Set(), total: 0 };
  for (const [kind, key] of KINDS) {
    const B = byKey(base?.[kind], key), C = byKey(cur?.[kind], key);
    d.added[kind] = 0; d.changed[kind] = 0; d.removed[kind] = 0;
    const touch = (x) => { if (!x) return; const box = kind === 'containers' ? x.id : kind === 'compartments' ? x.containerId : (x.place ? parseId(x.place)?.container : ''); if (box) d.boxes.add(box); };
    for (const [k, x] of C) { if (!B.has(k)) { d.added[kind]++; touch(x); } else if (!same(B.get(k), x)) { d.changed[kind]++; touch(x); touch(B.get(k)); } }
    for (const [k, x] of B) if (!C.has(k)) { d.removed[kind]++; touch(x); }
  }
  d.total = KINDS.reduce((n, [k]) => n + d.added[k] + d.changed[k] + d.removed[k], 0) + (base && !same(base.meta, cur.meta) && !KINDS.some(([k]) => d.added[k] || d.changed[k] || d.removed[k]) ? 1 : 0);
  return d;
}
// TC-R65: one commit per sync, with a message such as "WW-067: 3 tools added"
export function commitMessage(base, cur) {
  const d = diffRecords(base, cur);
  const word = { containers: ['box', 'boxes'], compartments: ['compartment', 'compartments'], items: ['tool', 'tools'] };
  const parts = [];
  for (const [kind] of KINDS) for (const [what, verb] of [['added', 'added'], ['changed', 'changed'], ['removed', 'removed']]) {
    const n = d[what][kind]; if (n) parts.push(`${n} ${word[kind][n === 1 ? 0 : 1]} ${verb}`);
  }
  if (!parts.length) return 'Tool Ctrl: settings changed';
  const boxes = [...d.boxes];
  return (boxes.length === 1 ? `${boxes[0]}: ` : boxes.length > 1 ? `${boxes.length} boxes: ` : '') + parts.join(', ');
}

// TC-R66: three-way merge, field by field. Where both sides changed the same field, the local value stays
// for now and the field is listed in conflicts for the person to choose (TC-S08).
export function mergeRecords(base, local, remote) {
  base = base || { meta: {}, containers: [], compartments: [], items: [] };
  local = clone(local);
  const renamed = [];
  // Two devices each added a box with the same new number: the local one takes the next free number
  const Bc = byKey(base.containers, 'id'), Rc = byKey(remote.containers, 'id');
  const hi = (p) => Math.max(nextNumber(local, p), nextNumber(remote, p)) ;
  for (const x of [...local.containers]) {
    if (!Bc.has(x.id) && Rc.has(x.id) && !same(x, Rc.get(x.id))) {
      const was = x.id, to = formatId(x.prefix, hi(x.prefix));
      renameContainer(local, was, to); renamed.push([was, to]);
    }
  }
  // Same for a compartment added on both sides with the same number
  const Bk = byKey(base.compartments, 'id'), Rk = byKey(remote.compartments, 'id');
  for (const k of [...local.compartments]) {
    if (!Bk.has(k.id) && Rk.has(k.id) && !same(k, Rk.get(k.id))) {
      const c = getC(local, k.containerId), rc = getC(remote, k.containerId);
      const n = Math.max(c?.cmax?.[k.type] || 0, rc?.cmax?.[k.type] || 0) + 1;
      const was = k.id; k.n = n; k.id = compId(k.containerId, k.type, n); if (c) c.cmax[k.type] = n;
      for (const it of local.items) if (it.place === was) it.place = k.id;
      renamed.push([was, k.id]);
    }
  }
  const conflicts = [];
  const out = { meta: {}, containers: [], compartments: [], items: [] };
  for (const [kind, key] of KINDS) {
    const B = byKey(base[kind], key), L = byKey(local[kind], key), R = byKey(remote[kind], key);
    for (const k of new Set([...L.keys(), ...R.keys()])) {
      const b = B.get(k), l = L.get(k), r = R.get(k);
      if (l && !r) { if (!b || !same(l, b)) out[kind].push(l); continue; } // remote removed it: keep only if changed here
      if (r && !l) { if (!b || !same(r, b)) out[kind].push(r); continue; }
      if (same(l, r) || same(r, b)) { out[kind].push(l); continue; }
      if (same(l, b)) { out[kind].push(r); continue; }
      const m = {};
      for (const f of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const lv = l[f], rv = r[f], bv = b?.[f];
        if (same(lv, rv) || same(rv, bv)) m[f] = lv;
        else if (same(lv, bv)) m[f] = rv;
        else if (f === 'history') { const seen = new Set(); m[f] = [...(bv || []), ...lv, ...rv].filter((h) => { const s = stable(h); if (seen.has(s)) return false; seen.add(s); return true; }); }
        else if (f === 'cmax') m[f] = Object.fromEntries(Object.keys({ ...lv, ...rv }).map((t) => [t, Math.max(lv?.[t] || 0, rv?.[t] || 0)]));
        else { m[f] = lv; conflicts.push({ kind, key: k, field: f, local: lv, remote: rv, label: kind === 'items' ? l.name : k }); }
      }
      out[kind].push(m);
    }
  }
  const lm = local.meta, rm = remote.meta, bm = base.meta || {};
  const pick = (f) => (same(lm[f], bm[f]) ? rm[f] : lm[f]);
  const counters = {};
  for (const p of new Set([...Object.keys(lm.counters || {}), ...Object.keys(rm.counters || {})])) counters[p] = Math.max(lm.counters?.[p] || 0, rm.counters?.[p] || 0);
  out.meta = { ...rm, ...lm, owner: pick('owner'), prefix: pick('prefix'), counters, itemSeq: Math.max(lm.itemSeq || 0, rm.itemSeq || 0),
    prefixes: [...new Set([...(rm.prefixes || []), ...(lm.prefixes || [])])], kinds: [...new Set([...(rm.kinds || []), ...(lm.kinds || [])])] };
  return { record: out, conflicts, renamed };
}
// TC-S08: apply the person's choice for one conflicting field
export function resolveConflict(rec, cf, keep) {
  const key = cf.kind === 'items' ? 'uid' : 'id';
  const x = rec[cf.kind].find((y) => y[key] === cf.key);
  if (x) x[cf.field] = clone(keep === 'remote' ? cf.remote : cf.local) ?? null;
}

// ---------- counts ----------
export const fmt = (n) => Number(n).toLocaleString('en-US');
