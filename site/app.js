// Tool Ctrl page. Rules live in core.js; this file draws them and handles input.
import * as c from './core.js';
import { tickList, BRANDS, HAND_TOOLS, CATALOG_DATE } from './catalog.js';
import { loadRecord, saveRecord, storageUse, askToKeep } from './store.js';

const $ = (id) => document.getElementById(id);
// h('div', {class: 'x', onclick: fn}, 'text', child): every string goes in as text, never as markup
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e[k] = v;
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // only for this file's own icon strings
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
  return e;
}
const ICON = {
  search: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
};
const icon = (k) => h('span', { html: ICON[k], style: 'display:inline-flex' });
const GH = () => (matchMedia('(pointer:coarse)').matches ? 44 : 34), ROW = 48;

const S = {
  rec: null, view: 'boxes', box: '', place: '', tick: null, tickBrand: 'All', tickQ: '', tickCons: false, tickAdded: [],
  boxQ: '', boxGroup: 'location', fold: {}, scroll: {},
  q: '', f: { tier: '', location: '', warranty: '' }, by: 'box', sort: 'name', sel: new Set(),
  warF: '', warQ: '', warSel: '', plan: null, planFile: '', renumber: true, closeGaps: false, kindOfBox: 'Systainer', drawerRows: true, over: null, note: '',
  undo: null, phone: false, low: false, saving: false, saveFailed: false,
};
const rec = () => S.rec;
const nOf = (n, one, many = one + 's') => `${c.fmt(n)} ${n === 1 ? one : many}`;

// ---------- saving (TC-R96) ----------
let pending = { containers: new Set(), compartments: new Set(), items: new Set() }, timer = 0, all = false;
function commit(ch = 'all') {
  rec().meta.changes += 1;
  if (ch === 'all') all = true;
  else for (const k of ['containers', 'compartments', 'items']) for (const id of ch[k] || []) pending[k].add(id);
  S.saving = true; leds();
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}
async function flush() {
  const ch = all ? 'all' : { containers: [...pending.containers], compartments: [...pending.compartments], items: [...pending.items] };
  pending = { containers: new Set(), compartments: new Set(), items: new Set() }; all = false;
  try { await saveRecord(rec(), ch); S.saveFailed = false; } catch { S.saveFailed = true; }
  S.saving = false; leds();
}
function leds() {
  const sv = $('ledSaved');
  sv.className = 'led ' + (S.saveFailed ? 'on-fault' : S.saving ? 'on-busy' : rec() ? 'on-ok' : '');
  sv.querySelector('span').textContent = S.saveFailed ? 'Not saved' : S.saving ? 'Saving' : rec() ? (S.low ? 'Saved · storage low' : 'Saved') : 'Nothing saved yet';
}

// ---------- Undo (TC-R95) ----------
function offerUndo(text, fn) {
  S.undo = { text, fn };
  $('undoText').textContent = text; $('undo').hidden = false;
}
function clearUndo() { S.undo = null; $('undo').hidden = true; }
$('undoBtn').onclick = () => { if (S.undo) { S.undo.fn(); clearUndo(); commit(); render(); } };
const change = (fn, ch) => { clearUndo(); fn(); commit(ch); render(); };

// ---------- files ----------
function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const readFile = (f) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsText(f); });

// ---------- virtual list (Dense lists: long lists, group header) ----------
// rows: [{ g: true, key, el: () => Node } | { el: () => Node }]. Only the rows on screen are drawn.
function vlist(key, rows, { onFold } = {}) {
  const box = h('div', { class: 'vlist', role: 'list' });
  const spacer = h('div', { class: 'spacer' });
  box.append(spacer);
  const gh = GH(), tops = []; let y = 0;
  for (const r of rows) { tops.push(y); y += r.g ? gh : ROW; }
  spacer.style.height = y + 'px';
  let last = '';
  const paint = () => {
    const top = box.scrollTop, bot = top + (box.clientHeight || 600) + 400;
    let lo = 0, hi = rows.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tops[m] + ROW < top - 200) lo = m + 1; else hi = m; }
    let end = lo; while (end < rows.length && tops[end] < bot) end++;
    const sig = `${lo}:${end}:${Math.round(top)}`;
    if (sig === last) return; last = sig;
    spacer.textContent = '';
    for (let i = lo; i < end; i++) { const n = rows[i].el(); n.classList.add('vrow'); n.style.top = tops[i] + 'px'; spacer.append(n); }
    // the group header sticks while its rows scroll
    let g = -1; for (let i = Math.min(lo + 40, rows.length - 1); i >= 0; i--) if (rows[i].g && tops[i] <= top) { g = i; break; }
    if (g >= 0 && tops[g] < top) { const n = rows[g].el(); n.classList.add('vrow'); n.style.top = top + 'px'; n.style.zIndex = 2; spacer.append(n); }
    S.scroll[key] = top;
  };
  box.onscroll = () => requestAnimationFrame(paint);
  requestAnimationFrame(() => { box.scrollTop = S.scroll[key] || 0; last = ''; paint(); });
  return box;
}
const ghead = (key, name, count, folded, onclick) => h('button', { type: 'button', class: 'ghead', onclick, 'aria-expanded': String(!folded) },
  h('span', { class: 'tw' }, folded ? '▸' : '▾'), h('span', { class: 'gn' }, name), h('span', { class: 'gc' }, c.fmt(count)));
const fold = (list, name) => { const k = `${list}:${name}`; S.fold[k] = !S.fold[k]; render(); };
const folded = (list, name) => !!S.fold[`${list}:${name}`];

const area = (n, title, desc, state, stateCls, ...body) => h('section', { class: 'tier' },
  h('div', { class: 'tier-h' }, h('span', { class: 'n' }, n), h('h2', {}, title), h('span', { class: 'tier-d' }, desc), h('span', { class: `tier-s ${stateCls}` }, state)),
  h('div', { class: 'pad' }, ...body));
const searchBox = (value, placeholder, oninput, id) => h('label', { class: 'search' }, icon('search'),
  h('input', { value, placeholder, 'aria-label': placeholder, id, oninput: (e) => { oninput(e.target.value); } }));
const pick = (label, value, options, onchange, cls = '') => h('select', { class: `pick ${cls}`, 'aria-label': label, onchange: (e) => onchange(e.target.value) },
  options.map(([v, t]) => h('option', { value: v, selected: v === value }, `${label} ${t}`)));
const statusSpan = (w) => { const s = c.warrantyStatus(w); const cls = { active: 'st ok', soon: 'st att', ended: 'st', noend: 'st', none: 'st none' }[s]; return h('span', { class: cls }, s === 'soon' ? `Ends ${c.warrantyEnd(w)}` : c.STATUS_TEXT[s]); };
const pathEl = (it) => { const p = c.placeParts(rec(), it.place, it.looseAt); return h('span', { class: 'c-path' }, [p.location, ...p.via].filter(Boolean).join(' › ') + (p.location ? ' › ' : ''), h('b', {}, p.box || 'Loose'), p.comp ? ` › ${p.comp}` : ''); };

// ---------- views ----------
function render() {
  document.body.classList.toggle('ro', S.phone);
  const r = rec();
  $('views').hidden = !r;
  leds();
  if (!r) { $('app').replaceChildren(startView()); return; }
  const live = r.items.filter((i) => i.status === 'active');
  $('cBoxes').textContent = c.fmt(r.containers.filter((x) => x.status === 'active').length);
  $('cItems').textContent = c.fmt(live.length);
  $('cWar').textContent = c.fmt(c.warrantyCounts(r).total);
  for (const b of document.querySelectorAll('#views button')) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
  document.body.classList.toggle('open', (S.view === 'boxes' && !!S.box) || (S.view === 'warranty' && !!S.warSel));
  const v = { boxes: boxesView, items: itemsView, warranty: warrantyView, record: recordView }[S.view]();
  $('app').replaceChildren(v);
}
for (const b of document.querySelectorAll('#views button')) b.onclick = () => { S.view = b.dataset.view; render(); };

// ---- first open (TC-S01, TC-R103) ----
function startView() {
  let owner = '', prefix = '';
  const err = h('span', { class: 'err' });
  const first = h('span', { class: 'mono', style: 'font-size:var(--t-body);height:34px;display:flex;align-items:center' }, '—');
  const pre = h('input', { class: 'in m', maxlength: 4, 'aria-label': 'ID prefix', oninput: (e) => { prefix = e.target.value.toUpperCase(); e.target.value = prefix; upd(); } });
  const upd = () => { const e = c.prefixError(prefix); err.textContent = prefix ? e : ''; first.textContent = !e ? c.formatId(prefix, 1) : '—'; };
  const own = h('input', { class: 'in', 'aria-label': 'Owner name', oninput: (e) => { owner = e.target.value; if (!pre.dataset.touched) { prefix = c.suggestPrefix(owner); pre.value = prefix; } upd(); } });
  pre.addEventListener('input', () => { pre.dataset.touched = '1'; });
  const begin = (then) => {
    const e = c.prefixError(prefix); if (e) { err.textContent = e; pre.focus(); return; }
    S.rec = c.emptyRecord(owner.trim(), prefix); commit('all'); askToKeep(); then();
  };
  const fileIn = h('input', { type: 'file', accept: '.csv,.json,text/csv,application/json', hidden: true, onchange: (e) => openFile(e.target.files[0], () => begin(() => {})) });
  return area(1, 'Get started', S.phone ? 'Look things up here' : 'Name your boxes, then fill them', 'Nothing recorded yet', 'idle',
    S.phone ? h('div', { class: 'stack' },
      h('p', { class: 'small', style: 'margin:0' }, 'Your record is built on a computer or iPad. Open a backup saved there to look things up on this phone.'),
      h('div', { class: 'choices' }, h('button', { type: 'button', class: 'choice first', onclick: () => fileIn.click() }, h('b', {}, 'Open a backup'), h('span', {}, 'A Tool Ctrl backup file. It opens on this phone; nothing is uploaded.'))), fileIn)
      : h('div', { class: 'stack', style: 'gap:21px' },
        h('div', { class: 'row', style: 'align-items:flex-start' },
          h('label', { class: 'f', style: 'flex:2 1 233px' }, h('span', {}, 'Owner name'), own),
          h('label', { class: 'f', style: 'flex:1 1 120px' }, h('span', {}, 'ID prefix · up to 4 capitals'), pre, err),
          h('div', { class: 'f', style: 'flex:1 1 120px' }, h('span', {}, 'First box will be'), first)),
        h('p', { class: 'small', style: 'margin:0' }, 'Every box you own shares this prefix and one count. A number is never reused, so a printed label always points at one box.'),
        h('div', { class: 'choices' },
          h('button', { type: 'button', class: 'choice first', onclick: () => begin(() => { S.view = 'record'; render(); setTimeout(() => $('importFile')?.click(), 50); }) }, h('b', {}, 'Import a list'), h('span', {}, 'A spreadsheet saved as .csv, or a Tool Ctrl backup. A Systainer list from Box Ctrl imports as it stands.')),
          h('button', { type: 'button', class: 'choice', onclick: () => begin(() => { render(); boxDialog(); }) }, h('b', {}, 'Add a box'), h('span', {}, 'Start with one box, then tick off what\'s in it.')),
          h('button', { type: 'button', class: 'choice', onclick: () => begin(() => { S.tick = 'loose'; render(); }) }, h('b', {}, 'Start from the tick-list'), h('span', {}, 'Click the tools you own by brand. They wait as Loose until you put them in a box.'))),
        h('div', { class: 'health' }, h('b', {}, 'Stays on this device'), h('span', {}, 'Your record is kept in this browser. Export a backup in Record to keep a copy or move it to another device.'))));
}

// ---- Boxes (TC-U02, TC-U03) ----
function boxesView() {
  const r = rec();
  const hits = c.search(r, S.boxQ);
  const ids = new Set(hits.containers.map((x) => x.id));
  if (S.boxQ) for (const it of hits.items) { const p = c.placeParts(r, it.place); if (p.box) ids.add(p.box); }
  const shown = r.containers.filter((x) => ids.has(x.id));
  const groups = c.groupContainers(r, shown, S.boxGroup);
  const rows = [];
  for (const g of groups) {
    const fo = folded('b', g.name);
    rows.push({ g: true, el: () => ghead('b', g.name, g.rows.length, fo, () => fold('b', g.name)) });
    if (!fo) for (const x of g.rows) rows.push({ el: () => {
      const n = c.itemsIn(r, x.id, true).length, ks = c.compsOf(r, x.id).length;
      return h('button', { type: 'button', class: `brow${x.id === S.box ? ' sel' : ''}${x.status === 'retired' ? ' retired' : ''}`, onclick: () => { S.box = x.id; S.place = ''; S.tick = null; render(); } },
        h('span', { class: 'bid' }, x.id), h('span', { class: 'bnm' }, h('b', {}, x.name || 'No name'), h('small', {}, [x.kindOfBox, ks ? `${ks} ${ks === 1 ? 'compartment' : 'compartments'}` : x.kind, x.status === 'retired' ? 'Retired' : ''].filter(Boolean).join(' · '))), h('span', { class: 'bn' }, c.fmt(n)));
    } });
  }
  const sinceBackup = r.meta.changes - (r.meta.backupAt || 0);
  const list = h('section', { class: 'tier listcol' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 1), h('h2', {}, 'Boxes'), h('span', { class: 'tier-d' }, S.boxGroup === 'kind' ? 'By kind of box' : 'By location'), h('span', { class: 'tier-s ok' }, nOf(r.containers.filter((x) => x.status === 'active').length, 'box', 'boxes'))),
    h('div', { class: 'pad', style: 'gap:13px' },
      S.low && h('div', { class: 'health warn' }, h('b', {}, 'Storage is running low'), h('span', {}, 'This browser says it may clear site data to make room. Export a backup now.'), h('button', { type: 'button', class: 'key', onclick: exportBackup }, 'Export backup')),
      !S.phone && sinceBackup >= c.BACKUP_EVERY && h('div', { class: 'health warn' }, h('b', {}, `${c.fmt(sinceBackup)} changes since your last backup`), h('span', {}, 'Your record lives only in this browser. A backup keeps it safe if site data is cleared.'), h('button', { type: 'button', class: 'key', onclick: exportBackup }, 'Export backup')),
      h('div', { class: 'fbar' },
        searchBox(S.boxQ, 'Find a box by ID, name or tool', (v) => { S.boxQ = v; S.scroll.b = 0; render(); requestAnimationFrame(() => { const i = $('boxQ'); i.focus(); i.setSelectionRange(v.length, v.length); }); }, 'boxQ'),
        pick('Group', S.boxGroup, [['location', 'Location'], ['kind', 'Kind of box'], ['none', 'None']], (v) => { S.boxGroup = v; render(); }),
        h('span', { class: 'count' }, h('b', {}, c.fmt(shown.length)), ' of ', h('b', {}, c.fmt(r.containers.length)), ' boxes')),
      rows.length ? vlist('b', rows) : h('div', { class: 'empty' }, h('b', {}, S.boxQ ? `No boxes match “${S.boxQ}”` : 'No boxes yet'), h('span', {}, S.boxQ ? 'Searched IDs, names, locations and the tools inside.' : 'Add a box, or import a list in Record.'),
        S.boxQ && h('button', { type: 'button', class: 'key', onclick: () => { S.boxQ = ''; render(); } }, 'Clear search')),
      h('div', { class: 'row edit' }, h('button', { type: 'button', class: 'key', onclick: () => boxDialog() }, 'Add box'), h('button', { type: 'button', class: 'key', onclick: () => { S.box = ''; S.tick = 'loose'; render(); } }, 'Add standard tools'))));
  return h('div', { class: 'split' }, list, S.tick === 'loose' && !S.box ? tickPanel('loose') : S.box ? boxDetail() : looseArea());
}

function looseArea() {
  const loose = rec().items.filter((i) => i.status === 'active' && !i.place);
  return area(2, 'Loose', 'Tools not in a box', nOf(loose.length, 'tool'), loose.length ? 'warn' : 'idle',
    loose.length ? itemList(loose, true) : h('p', { class: 'small', style: 'margin:0' }, 'Choose a box on the left to see what is in it.'));
}

function boxDetail() {
  const r = rec(), x = c.getC(r, S.box);
  if (!x) { S.box = ''; return looseArea(); }
  const ks = c.compsOf(r, x.id);
  if (!S.place || (S.place !== x.id && !ks.some((k) => k.id === S.place))) S.place = ks[0]?.id || x.id;
  const w = c.whereIs(r, x.id);
  const total = c.itemsIn(r, x.id, true).length;
  const places = [{ id: x.id, name: 'In the box itself', n: c.itemsIn(r, x.id).length }, ...ks.map((k) => ({ id: k.id, name: k.name || c.COMP_TYPES[k.type], n: c.itemsIn(r, k.id).length }))];
  const cur = places.find((p) => p.id === S.place);
  return h('section', { class: 'tier detailcol' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 2), h('h2', { class: 'mono' }, x.id), h('span', { class: 'tier-d' }, [x.kindOfBox, w.location].filter(Boolean).join(' · ')), h('span', { class: `tier-s ${x.status === 'retired' ? 'idle' : 'ok'}` }, x.status === 'retired' ? 'Retired' : nOf(total, 'tool'))),
    h('div', { class: 'pad' },
      h('button', { type: 'button', class: 'backlink', onclick: () => { S.box = ''; S.tick = null; render(); } }, '‹ Boxes'),
      h('dl', { class: 'read' },
        rd('Name', x.name || 'No name'), rd('Kind of box', x.kindOfBox), rd('Location', [w.location, ...w.via].filter(Boolean).join(' · on ') || 'Not set'),
        rd('Sits on', x.sitsOn || 'Nothing'), rd('Kind', x.kind || '—'), rd('Status', x.status === 'retired' ? 'Retired' : 'Active'),
        x.notes && rd('Notes', x.notes)),
      x.status === 'active' && h('div', { class: 'row edit' },
        h('button', { type: 'button', class: 'key go', onclick: () => { S.tick = S.place; S.tickAdded = []; render(); } }, icon('plus'), 'Add tools'),
        h('button', { type: 'button', class: 'key', onclick: () => drawersDialog(x.id) }, 'Add drawers'),
        h('button', { type: 'button', class: 'key', onclick: () => boxDialog(x.id) }, 'Edit box'),
        h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'key', onclick: () => retireDialog(x.id) }, 'Retire')),
      (ks.length > 0 || cur.n === 0) && h('div', { class: 'stack', style: 'gap:8px' },
        h('div', { class: 'sub' }, h('h3', {}, ks.length ? 'Compartments' : 'Contents'), h('span', { class: 'small' }, ks.length ? 'Drawers count from the top' : 'No drawers or trays. Add drawers if this box has them.')),
        ks.length > 0 && h('div', { class: 'list' }, places.map((p) => h('button', { type: 'button', class: `crow${p.id === S.place ? ' sel' : ''}`, onclick: () => { S.place = p.id; if (S.tick) S.tick = p.id; render(); } },
          h('span', { class: 'cid' }, p.id === x.id ? x.id : p.id), h('span', {}, p.name), h('span', { class: 'cn' }, c.fmt(p.n)))))),
      S.tick ? tickPanel(S.tick) : h('div', { class: 'stack', style: 'gap:8px' },
        h('div', { class: 'sub' }, h('h3', { class: 'mono' }, cur.id), h('span', { class: 'small' }, `${cur.name} · ${c.fmt(cur.n)} ${cur.n === 1 ? 'tool' : 'tools'}`),
          S.place !== x.id && h('button', { type: 'button', class: 'key edit', style: 'margin-left:auto', onclick: () => compDialog(S.place) }, 'Rename')),
        itemList(c.itemsIn(r, S.place), false, S.place))));
}
const rd = (k, v) => h('div', {}, h('dt', {}, k), h('dd', {}, v));

function itemList(items, showPath, place) {
  if (!items.length) return h('div', { class: 'empty' }, h('b', {}, 'Nothing here yet'),
    !S.phone && h('span', {}, 'Use Add tools to tick what is in it, or type one.'),
    !S.phone && place && h('button', { type: 'button', class: 'key', onclick: () => itemDialog(null, { place }) }, 'Type a tool'));
  const sorted = items.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const row = (it) => h('div', { class: 'irow nocheck' },
    h('button', { type: 'button', class: 'nm', onclick: () => itemDialog(it.uid) }, h('b', {}, it.name), h('small', {}, [it.brand, showPath ? (it.looseAt || 'Loose') : ''].filter(Boolean).join(' · ') || it.tier)),
    h('span', { class: 'c-brand' }, showPath ? (it.looseAt || 'Loose') : (it.brand || 'No brand')), h('span', { class: 'c-q' }, it.qty ?? '—'), h('span', { class: 'c-war' }, statusSpan(it.warranty)));
  const head = h('div', { class: 'ihead nocheck' }, h('span', {}, 'Tool'), h('span', {}, showPath ? 'Where' : 'Brand'), h('span', { class: 'c-q' }, 'Qty'), h('span', {}, 'Warranty'));
  return h('div', { class: 'stack', style: 'gap:8px' },
    sorted.length > 40 ? h('div', {}, head, vlist(`p:${place || 'loose'}`, sorted.map((it) => ({ el: () => row(it) })))) : h('div', { class: 'list' }, head, sorted.map(row)),
    !S.phone && place && h('div', { class: 'row' }, h('button', { type: 'button', class: 'key', onclick: () => itemDialog(null, { place }) }, 'Type a tool')));
}

// ---- tick-list (TC-S03, TC-R21, TC-R22) ----
function tickPanel(place) {
  const r = rec(), where = place === 'loose' ? null : place;
  const list = tickList(S.tickQ, S.tickBrand, S.tickCons);
  const tierOf = (t) => ({ power: 'Power', hand: 'Hand', consumable: 'Consumable' }[t] || 'Power');
  const rows = list.map((t) => ({ el: () => {
    const here = where ? c.alreadyIn(r, where, t.name, t.brand) : false;
    const added = S.tickAdded.find((a) => a.name === t.name && a.brand === t.brand);
    const box = h('input', { type: 'checkbox', checked: here || !!added, disabled: here && !added, 'aria-label': t.name, onchange: (e) => {
      clearUndo();
      if (e.target.checked) { const it = c.addItem(r, { name: t.name, brand: t.brand, kind: t.kind, tier: tierOf(t.tier), place: where, source: 'Catalog' }); S.tickAdded.push({ name: t.name, brand: t.brand, uid: it.uid }); commit({ items: [it.uid] }); }
      else if (added) { r.items = r.items.filter((i) => i.uid !== added.uid); S.tickAdded = S.tickAdded.filter((a) => a !== added); commit('all'); }
      render();
    } });
    return h('label', { class: `irow${added ? ' on' : ''}` }, h('span', { class: 'cb' }, box), h('span', { class: 'nm' }, h('b', {}, t.name), h('small', {}, [t.brand, t.kind].filter(Boolean).join(' · '))),
      h('span', { class: 'c-brand' }, t.brand || 'No brand'), h('span', { class: 'c-brand' }, t.kind), h('span', {}), h('span', { class: 'c-war' }, h('span', { class: here && !added ? 'st none' : added ? 'st ok' : 'st none' }, here && !added ? 'Already here' : added ? 'Added' : '')));
  } }));
  const label = where || 'Loose';
  return h('div', { class: 'panel' },
    h('div', { class: 'sub' }, h('h3', {}, 'Add tools to ', h('span', { class: 'mono' }, label)), h('span', { class: 'small' }, 'Tick what is there. Each tick adds it now.')),
    h('div', { class: 'segc', role: 'group', 'aria-label': 'Brand' }, ['All', ...BRANDS, HAND_TOOLS].map((b) => h('button', { type: 'button', 'aria-pressed': String(S.tickBrand === b), onclick: () => { S.tickBrand = b; S.scroll.t = 0; render(); } }, b))),
    h('div', { class: 'fbar' },
      searchBox(S.tickQ, 'Search the tick-list', (v) => { S.tickQ = v; S.scroll.t = 0; render(); requestAnimationFrame(() => { const i = $('tickQ'); i.focus(); i.setSelectionRange(v.length, v.length); }); }, 'tickQ'),
      h('label', { class: 'small', style: 'display:inline-flex;gap:5px;align-items:center' }, h('input', { type: 'checkbox', checked: S.tickCons, onchange: (e) => { S.tickCons = e.target.checked; render(); } }), 'Show consumables'),
      h('span', { class: 'count' }, h('b', {}, c.fmt(list.length)), ' tools')),
    rows.length ? vlist('t', rows) : h('div', { class: 'empty' }, h('b', {}, `Nothing in the list matches “${S.tickQ}”`), h('span', {}, 'Type it instead.')),
    h('div', { class: 'row' }, S.tickAdded.length > 0 && h('span', { class: 'st ok' }, `${S.tickAdded.length} added to ${label}`), h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'key', onclick: () => itemDialog(null, { place: where, name: S.tickQ }) }, 'Can\'t find it? Type a tool'),
      h('button', { type: 'button', class: 'key go', onclick: () => { S.tick = null; S.tickAdded = []; S.tickQ = ''; render(); } }, 'Done')),
    h('p', { class: 'small', style: 'margin:0' }, `Tool names belong to their makers. Check the name against your tool. List of ${CATALOG_DATE}. Hand tools are listed without a brand.`));
}

// ---- Items (TC-S10, TC-S11) ----
function itemsView() {
  const r = rec();
  const found = c.filterItems(r, c.search(r, S.q).items, S.f);
  const groups = c.groupItems(r, found, S.by, S.sort);
  const rows = [];
  for (const g of groups) {
    const fo = folded('i', g.name);
    rows.push({ g: true, el: () => ghead('i', g.name, g.rows.length, fo, () => fold('i', g.name)) });
    if (!fo) for (const it of g.rows) rows.push({ el: () => {
      const on = S.sel.has(it.uid);
      return h('div', { class: `irow${on ? ' on' : ''}` },
        h('span', { class: 'cb edit' }, h('input', { type: 'checkbox', checked: on, 'aria-label': `Select ${it.name}`, onchange: (e) => { if (e.target.checked) S.sel.add(it.uid); else S.sel.delete(it.uid); render(); } })),
        h('button', { type: 'button', class: 'nm', onclick: () => itemDialog(it.uid) }, h('b', {}, it.name), h('small', {}, c.pathText(r, it).split(' › ').slice(0, -1).join(' › ') || 'Loose')),
        h('span', { class: 'c-brand' }, it.brand || '—'), pathEl(it), h('span', { class: 'c-q' }, it.qty ?? '—'), h('span', { class: 'c-war' }, statusSpan(it.warranty)));
    } });
  }
  const locs = [...new Set(r.containers.map((x) => x.location).filter(Boolean))].sort();
  const chips = [['tier', 'Tier'], ['location', 'Location'], ['warranty', 'Warranty']].filter(([k]) => S.f[k]).map(([k, t]) =>
    h('span', { class: 'chip' }, `${t}: ${k === 'warranty' ? c.STATUS_TEXT[S.f[k]] : S.f[k]}`, h('button', { type: 'button', 'aria-label': `Remove ${t} filter`, html: ICON.x, onclick: () => { S.f[k] = ''; render(); } })));
  const selN = S.sel.size;
  return area(1, 'Items', 'Every tool, wherever it is', `${c.fmt(r.items.filter((i) => i.status === 'active').length)} tools`, 'ok',
    h('div', { class: 'fbar' },
      searchBox(S.q, 'Search tools, brands, serial numbers', (v) => { S.q = v; S.scroll.i = 0; render(); requestAnimationFrame(() => { const i = $('itemQ'); i.focus(); i.setSelectionRange(v.length, v.length); }); }, 'itemQ'),
      pick('Tier', S.f.tier, [['', 'any'], ...c.TIERS.map((t) => [t, t])], (v) => { S.f.tier = v; render(); }),
      pick('Location', S.f.location, [['', 'any'], ...locs.map((l) => [l, l])], (v) => { S.f.location = v; render(); }),
      pick('Group', S.by, Object.entries(c.GROUP_BY), (v) => { S.by = v; S.scroll.i = 0; render(); }),
      pick('Sort', S.sort, [['name', 'Name'], ['brand', 'Brand']], (v) => { S.sort = v; render(); })),
    h('div', { class: 'fbar' }, chips,
      !S.phone && found.length > 0 && h('button', { type: 'button', class: 'key edit', onclick: () => { found.forEach((i) => S.sel.add(i.uid)); render(); } }, `Select all ${c.fmt(found.length)}`),
      h('span', { class: 'count' }, h('b', {}, c.fmt(found.length)), ' of ', h('b', {}, c.fmt(r.items.filter((i) => i.status === 'active').length)), ' tools')),
    selN > 0 && !S.phone && h('div', { class: 'selbar' }, h('b', {}, `${c.fmt(selN)} selected`),
      h('button', { type: 'button', class: 'key go', onclick: moveDialog }, 'Move to…'),
      h('button', { type: 'button', class: 'key', onclick: setFieldDialog }, 'Set field'),
      h('button', { type: 'button', class: 'key', onclick: retireItems }, 'Retire'),
      h('span', { style: 'flex:1' }), h('button', { type: 'button', class: 'key', onclick: () => { S.sel.clear(); render(); } }, 'Clear')),
    rows.length ? h('div', {}, h('div', { class: 'ihead' }, h('span', {}), h('span', {}, 'Tool'), h('span', {}, 'Brand'), h('span', {}, 'Where'), h('span', { class: 'c-q' }, 'Qty'), h('span', {}, 'Warranty')), vlist('i', rows))
      : h('div', { class: 'empty' }, h('b', {}, S.q ? `No tools match “${S.q}”` : 'No tools match these filters'),
        h('span', {}, `Searched names, brands, notes and serial numbers in all ${c.fmt(r.items.length)} tools.${chips.length ? ` ${chips.length} ${chips.length === 1 ? 'filter is' : 'filters are'} on.` : ''}`),
        chips.length > 0 && h('button', { type: 'button', class: 'key', onclick: () => { S.f = { tier: '', location: '', warranty: '' }; render(); } }, 'Clear filters')));
}

function retireItems() {
  const r = rec(), uids = [...S.sel];
  change(() => { for (const u of uids) c.getItem(r, u).status = 'retired'; S.sel.clear(); }, { items: uids });
  offerUndo(`Retired ${uids.length} ${uids.length === 1 ? 'tool' : 'tools'}`, () => { for (const u of uids) c.getItem(r, u).status = 'active'; });
}

// ---- Warranty (TC-S13, TC-S14) ----
function warrantyView() {
  const r = rec(), k = c.warrantyCounts(r);
  let list = c.warrantyList(r);
  if (S.warF === 'unregistered') list = list.filter((x) => x.it.warranty.registered === 'no');
  else if (S.warF) list = list.filter((x) => x.status === S.warF);
  if (S.warQ) { const w = S.warQ.toLowerCase(); list = list.filter((x) => `${x.it.name} ${x.it.brand} ${x.it.warranty.serial || ''}`.toLowerCase().includes(w)); }
  const stat = (key, label, n) => h('button', { type: 'button', 'aria-pressed': String(S.warF === key), onclick: () => { S.warF = S.warF === key ? '' : key; render(); } }, h('span', {}, label), h('b', {}, c.fmt(n)));
  const rows = list.map((x) => ({ el: () => h('button', { type: 'button', class: `wrow${x.it.uid === S.warSel ? ' sel' : ''}`, onclick: () => { S.warSel = x.it.uid; render(); } },
    h('span', { class: 'nm' }, h('b', {}, x.it.name), h('small', {}, [x.it.kind, x.it.brand].filter(Boolean).join(' · '))),
    h('span', { class: 'm w-x' }, x.it.warranty.serial || '—'), h('span', { class: 'm w-x' }, x.it.warranty.bought || '—'), h('span', { class: 'm w-x' }, x.end || '—'),
    statusSpan(x.it.warranty), h('span', { class: 'w-x' }, { yes: 'Yes', no: 'No', 'not-needed': 'Not needed' }[x.it.warranty.registered] || '—')) }));
  const main = h('section', { class: 'tier listcol' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 1), h('h2', {}, 'Warranty'), h('span', { class: 'tier-d' }, 'Tools with warranty details, by end date'), h('span', { class: `tier-s ${k.soon ? 'warn' : k.total ? 'ok' : 'idle'}` }, k.soon ? `${k.soon} ${k.soon === 1 ? 'ends' : 'end'} within 90 days` : nOf(k.total, 'tool'))),
    h('div', { class: 'pad', style: 'gap:13px' },
      h('div', { class: 'stats' }, stat('active', 'Active', k.active), stat('soon', 'Ends within 90 days', k.soon), stat('ended', 'Ended', k.ended), stat('unregistered', 'Not registered', k.unregistered)),
      h('div', { class: 'fbar' }, searchBox(S.warQ, 'Search tool or serial number', (v) => { S.warQ = v; render(); requestAnimationFrame(() => { const i = $('warQ'); i.focus(); i.setSelectionRange(v.length, v.length); }); }, 'warQ'),
        h('span', { class: 'count' }, h('b', {}, c.fmt(list.length)), list.length === 1 ? ' tool · sorted by end date' : ' tools · sorted by end date')),
      rows.length ? h('div', {}, h('div', { class: 'wrow head' }, h('span', {}, 'Tool'), h('span', {}, 'Serial'), h('span', {}, 'Bought'), h('span', {}, 'Ends'), h('span', {}, 'Status'), h('span', {}, 'Registered')), vlist('w', rows))
        : h('div', { class: 'empty' }, h('b', {}, k.total ? 'No tools match' : 'No warranty details yet'), h('span', {}, k.total ? 'Try another count or search.' : 'Open a tool and add its serial number and purchase date. It then shows here, sorted by when its warranty ends.'))));
  const it = S.warSel && c.getItem(r, S.warSel);
  if (!it) return h('div', { class: 'stack', style: 'gap:21px' }, main);
  const w = it.warranty || {};
  const card = area(2, it.name, [it.kind, it.brand].filter(Boolean).join(' · '), c.STATUS_TEXT[c.warrantyStatus(w)], { active: 'ok', soon: 'warn' }[c.warrantyStatus(w)] || 'idle',
    h('button', { type: 'button', class: 'backlink', onclick: () => { S.warSel = ''; render(); } }, '‹ Warranty'),
    h('dl', { class: 'card' }, rd('Serial number', h('span', { class: 'mono' }, w.serial || 'Not recorded')), rd('Registered', { yes: 'Yes', no: 'No', 'not-needed': 'Not needed' }[w.registered] || 'Not recorded'),
      rd('Bought', h('span', { class: 'mono' }, w.bought || 'Not recorded')), rd('From', w.seller || 'Not recorded'), rd('Warranty', w.years ? `${w.years} years` : 'Not recorded'),
      rd('Ends', h('span', { class: 'mono' }, c.warrantyEnd(w) || 'Not recorded')), rd('Price paid', w.price || 'Not recorded'),
      rd('Receipt', /^https?:\/\//i.test(w.receipt || '') ? h('a', { href: w.receipt, target: '_blank', rel: 'noopener noreferrer' }, 'Open receipt ↗') : (w.receipt || 'Not recorded')),
      w.regNo && rd('Registration number', h('span', { class: 'mono' }, w.regNo))),
    h('div', { class: 'stack', style: 'gap:3px' }, h('span', { class: 'small' }, 'Where it is now'), h('span', { class: 'path' }, c.pathText(r, it))),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'key go', onclick: async (e) => {
      try { await navigator.clipboard.writeText(c.warrantyCard(r, it)); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; }
      setTimeout(() => { e.target.textContent = 'Copy details'; }, 1600);
    } }, 'Copy details'), h('button', { type: 'button', class: 'key edit', onclick: () => itemDialog(it.uid) }, 'Edit')),
    h('p', { class: 'small', style: 'margin:0' }, 'Copy details puts everything above on the clipboard as plain text, ready for a warranty claim.'));
  return h('div', { class: 'split even' }, main, card);
}

// ---- Record (TC-S04, TC-S05) ----
function recordView() {
  const r = rec(), m = r.meta;
  const fileIn = h('input', { type: 'file', id: 'importFile', accept: S.phone ? '.json,application/json' : '.csv,.json,.xlsx,text/csv,application/json', hidden: true, onchange: (e) => { openFile(e.target.files[0]); e.target.value = ''; } });
  const drop = h('div', { class: 'drop edit', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); openFile(e.dataTransfer.files[0]); } },
    h('span', {}, 'Drop a spreadsheet (.csv) or a backup (.json) here. It opens on this device; nothing is uploaded.'), h('button', { type: 'button', class: 'key', onclick: () => fileIn.click() }, 'Choose file'));
  const since = m.changes - (m.backupAt || 0);
  const ie = area(1, S.phone ? 'Backup' : 'Import and export', S.phone ? 'Open a backup saved on a computer or iPad' : 'Bring a list in, send labels to Box Ctrl',
    S.plan ? 'Waiting for you' : S.over ? `${S.over.length} boxes ran over` : m.lastBackup ? `Backed up ${m.lastBackup}` : 'Not backed up', S.plan || S.over || !m.lastBackup ? 'warn' : 'ok',
    S.note && h('div', { class: 'health bad' }, h('b', {}, 'That file didn\'t open'), h('span', {}, S.note)),
    S.plan && planPanel(), S.over && overPanel(),
    fileIn, drop,
    S.phone && h('div', { class: 'row' }, h('button', { type: 'button', class: 'key', onclick: () => fileIn.click() }, 'Open a backup'), h('span', { class: 'small' }, 'Replaces what this phone shows. Nothing is sent anywhere.')),
    h('div', { class: 'row edit' },
      h('button', { type: 'button', class: 'key', onclick: exportForBox }, 'Export for Box Ctrl'),
      h('label', { class: 'small', style: 'display:inline-flex;gap:5px;align-items:center' }, h('input', { type: 'checkbox', checked: S.drawerRows, onchange: (e) => { S.drawerRows = e.target.checked; } }), 'Give each drawer its own row'),
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'key', onclick: () => download(c.fileName('tool-ctrl-items', 'csv'), c.exportItems(r), 'text/csv') }, 'Export items'),
      h('button', { type: 'button', class: 'key', onclick: exportBackup }, 'Export backup')),
    h('dl', { class: 'read' }, rd('Last backup', h('span', { class: 'mono' }, m.lastBackup || 'Never')), rd('Changes since', h('span', { class: 'mono' }, c.fmt(Math.max(0, since)))),
      rd('Record', h('span', { class: 'mono' }, `${c.fmt(r.containers.length)} boxes · ${c.fmt(r.compartments.length)} compartments · ${c.fmt(r.items.length)} tools`))));
  const pe = h('span', { class: 'err' });
  const numbering = h('section', { class: 'tier edit' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 2), h('h2', {}, 'Numbering'), h('span', { class: 'tier-d' }, 'Prefixes and kinds of box'), h('span', { class: 'tier-s ok' }, `Next ${c.nextId(r)}`)),
    h('div', { class: 'pad' },
      h('div', { class: 'row', style: 'align-items:flex-start' },
        h('label', { class: 'f' }, h('span', {}, 'Owner name'), h('input', { class: 'in', value: m.owner, onchange: (e) => change(() => { m.owner = e.target.value.trim(); }, {}) })),
        h('label', { class: 'f', style: 'flex:0 1 140px' }, h('span', {}, 'Prefix for new boxes'), h('input', { class: 'in m', value: m.prefix, maxlength: 4, onchange: (e) => {
          const v = e.target.value.toUpperCase(), er = c.prefixError(v); pe.textContent = er; if (er) return;
          change(() => { m.prefix = v; if (!m.prefixes.includes(v)) m.prefixes.push(v); }, {});
        } }), pe)),
      h('p', { class: 'small', style: 'margin:0' }, 'Changing the prefix only affects new boxes. Printed labels keep their IDs.'),
      h('dl', { class: 'read' }, rd('Prefixes in use', h('span', { class: 'mono' }, m.prefixes.join(' · ') || m.prefix)), rd('Next box', h('span', { class: 'mono' }, c.nextId(r))),
        rd('Retired', h('span', { class: 'mono' }, c.fmt(r.containers.filter((x) => x.status === 'retired').length)))),
      h('div', { class: 'fbar' }, m.kinds.map((k) => h('span', { class: 'chip plain' }, k))),
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const v = e.target.k.value.trim(); if (v && !m.kinds.includes(v)) change(() => m.kinds.push(v.slice(0, 28)), {}); } },
        h('input', { class: 'in', name: 'k', placeholder: 'Another kind of box', style: 'flex:1 1 200px;width:auto' }), h('button', { type: 'submit', class: 'key' }, 'Add kind of box'))));
  const gh = area(3, 'GitHub', 'Your own repo, optional', 'Not in this build', 'idle',
    h('p', { class: 'small', style: 'margin:0' }, 'Sync with a private GitHub repo of your own comes in a later build. Until then, Export backup moves your record between devices, and Open a backup reads it on a phone.'));
  return h('div', { class: 'split even' }, h('div', { class: 'stack', style: 'gap:21px' }, ie, numbering), gh);
}

async function openFile(f, before) {
  if (!f) return;
  S.note = ''; S.plan = null; S.over = null;
  if (/\.xlsx?$/i.test(f.name)) { S.note = `${f.name} is an Excel file. Save it as .csv from Excel, Numbers or Google Sheets, then open that.`; S.view = 'record'; render(); return; }
  if (f.size > 20 * 1024 * 1024) { S.note = `${f.name} is over 20 MB.`; render(); return; }
  const text = await readFile(f);
  if (/\.json$/i.test(f.name) || text.trim().startsWith('{')) {
    const b = c.readBackup(text);
    if (b.error) { S.note = b.error; S.view = 'record'; render(); return; }
    const has = rec() && rec().containers.length;
    if (has && !confirm(`Replace your record with this backup? It holds ${b.record.containers.length} boxes and ${b.record.items.length} tools. What is here now is replaced.`)) return;
    S.rec = b.record; S.box = ''; S.sel.clear(); clearUndo(); all = true; commit('all'); S.view = 'boxes'; render(); return;
  }
  if (S.phone) { S.note = 'A phone opens backups only. Import lists on a computer or iPad.'; render(); return; }
  if (before) before();
  S.planFile = f.name; S.planText = text;
  const ids = c.parseCsv(text).slice(1).map((row) => c.parseId(row[0] || '')).filter(Boolean);
  S.renumber = ids.some((p) => p.prefix !== rec().meta.prefix);
  S.closeGaps = false;
  S.plan = c.planImport(rec(), text, { renumberTo: S.renumber ? rec().meta.prefix : '', kindOfBox: S.kindOfBox });
  if (S.plan.error) { S.note = S.plan.error; S.plan = null; }
  S.view = 'record'; render();
}
function replan() { S.plan = c.planImport(rec(), S.planText, { renumberTo: S.renumber ? rec().meta.prefix : '', kindOfBox: S.kindOfBox, closeGaps: S.renumber && S.closeGaps }); render(); }
function planPanel() {
  const p = S.plan, m = rec().meta, rn = p.renumbered;
  return h('div', { class: 'panel' },
    h('div', { class: `health ${p.skipped.length ? 'warn' : 'ok'}` }, h('b', {}, `${S.planFile} read`),
      h('span', {}, `${c.fmt(p.boxes.length)} boxes, ${c.fmt(p.items)} tools, ${p.kept.length} ${p.kept.length === 1 ? 'column' : 'columns'} kept. ${p.skipped.length ? `${p.skipped.length} ${p.skipped.length === 1 ? 'row' : 'rows'} skipped.` : 'Nothing skipped.'}`)),
    h('label', { class: 'small', style: 'display:flex;gap:8px;align-items:center' }, h('input', { type: 'checkbox', checked: S.renumber, onchange: (e) => { S.renumber = e.target.checked; replan(); } }), `Renumber to ${m.prefix}${S.closeGaps ? '' : ', keeping each number'}`),
    S.renumber && (p.gaps || S.closeGaps) && h('label', { class: 'small', style: 'display:flex;gap:8px;align-items:center' }, h('input', { type: 'checkbox', checked: S.closeGaps, onchange: (e) => { S.closeGaps = e.target.checked; replan(); } }), 'Number them in order, closing the gaps. Only if no labels are printed yet.'),
    rn.length > 0 && h('div', { class: 'list' }, [rn[0], ...rn.filter(([a], i) => i > 0 && c.parseId(a).n !== c.parseId(rn[i - 1][0]).n + 1).slice(0, 4), rn[rn.length - 1]].filter((x, i, arr) => arr.indexOf(x) === i).map(([a, b]) => h('div', { class: 'crow', style: 'cursor:default' }, h('span', { class: 'cid' }, a), h('span', { class: 'mono' }, `→ ${b}`), h('span', {})))),
    h('label', { class: 'f', style: 'flex:0 1 auto' }, h('span', {}, 'Kind of box, where the file doesn\'t say'), h('select', { class: 'pick', onchange: (e) => { S.kindOfBox = e.target.value; replan(); } }, m.kinds.map((k) => h('option', { value: k, selected: k === S.kindOfBox }, k)))),
    p.kept.length > 0 && h('p', { class: 'small', style: 'margin:0' }, `Kept with each box, not shown: ${p.kept.join(', ')}.`),
    p.skipped.length > 0 && h('ul', { class: 'hist' }, p.skipped.slice(0, 12).map((s) => h('li', {}, `Row ${s.line}: ${s.why}`)), p.skipped.length > 12 && h('li', {}, `and ${p.skipped.length - 12} more`)),
    h('p', { class: 'small', style: 'margin:0' }, `Each box keeps its old ID in its notes. The next new box will be ${(() => { const t = c.emptyRecord(); t.meta = { ...m, counters: { ...m.counters } }; t.containers = [...rec().containers, ...p.boxes.map((b) => ({ prefix: b.prefix || m.prefix, n: b.n }))]; return c.nextId(t); })()}.`),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'key go', disabled: !p.boxes.length, onclick: () => {
      const plan = S.plan; S.plan = null;
      change(() => { c.applyImport(rec(), plan); all = true; }, 'all'); S.view = 'boxes';
      render();
    } }, `Add ${c.fmt(p.boxes.length)} boxes`), h('button', { type: 'button', class: 'key', onclick: () => { S.plan = null; render(); } }, 'Cancel')));
}
function exportForBox() {
  const ex = c.exportBoxCtrl(rec(), { compartments: S.drawerRows });
  if (ex.overruns.length) { S.over = ex.overruns; S.overCsv = ex.csv; render(); return; }
  download(c.fileName('tool-ctrl-boxes', 'csv'), ex.csv, 'text/csv');
}
function overPanel() {
  return h('div', { class: 'panel' },
    h('div', { class: 'health warn' }, h('b', {}, `${S.over.length} ${S.over.length === 1 ? 'label ran' : 'labels ran'} over`), h('span', {}, 'A Box Ctrl label holds two contents lines of 40 characters. These kept the first tools that fit, and no word was cut.')),
    h('div', { class: 'list' }, S.over.slice(0, 50).map((o) => h('div', { class: 'crow', style: 'cursor:default' }, h('span', { class: 'cid' }, o.id), h('span', {}, `${o.name} · ${o.left} of ${o.total} left off`), h('span', { class: 'cn' }, o.total)))),
    !S.drawerRows && h('p', { class: 'small', style: 'margin:0' }, 'Giving each drawer its own row usually fixes chests and drawer units.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'key go', onclick: () => { download(c.fileName('tool-ctrl-boxes', 'csv'), S.overCsv, 'text/csv'); S.over = null; render(); } }, 'Save CSV'),
      h('button', { type: 'button', class: 'key', onclick: () => { S.over = null; render(); } }, 'Back')));
}
function exportBackup() {
  const m = rec().meta;
  m.lastBackup = c.isoToday(); m.backupAt = m.changes + 1;
  commit({});
  download(c.fileName('tool-ctrl', 'json'), c.writeBackup(rec()), 'application/json');
  render();
}

// ---------- dialogs ----------
const dlg = $('dlg');
function openDialog(title, body, onsave, saveText = 'Save') {
  const form = h('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); const msg = onsave(form); if (msg) { err.textContent = msg; return; } dlg.close(); } });
  const err = h('p', { class: 'small', style: 'color:var(--fault);margin:0', role: 'alert' });
  form.append(h('h2', {}, title), ...[body].flat().filter(Boolean), err,
    h('div', { class: 'row' }, onsave && h('button', { type: 'submit', class: 'key go' }, saveText), h('span', { class: 'sp' }), h('button', { type: 'button', class: 'key', onclick: () => dlg.close() }, onsave ? 'Cancel' : 'Close')));
  dlg.replaceChildren(form); dlg.showModal();
  form.querySelector('input:not([type=checkbox]),select,textarea')?.focus();
}
const field = (label, input, cls = '') => h('label', { class: `f ${cls}` }, h('span', {}, label), input);
const inp = (name, value = '', extra = {}) => h('input', { class: 'in', name, value: value ?? '', ...extra });
const datalist = (id, values) => h('datalist', { id }, values.map((v) => h('option', { value: v })));

function boxDialog(id) {
  const r = rec(), x = id ? c.getC(r, id) : null;
  const locs = [...new Set(r.containers.map((b) => b.location).filter(Boolean))];
  openDialog(x ? `Edit ${x.id}` : `Add box ${c.nextId(r)}`, [
    h('div', { class: 'row' }, field('Name · up to 20', inp('name', x?.name, { maxlength: 20, required: true })), field('Kind of box', h('select', { class: 'in', name: 'kob' }, r.meta.kinds.map((k) => h('option', { value: k, selected: k === (x?.kindOfBox || 'Systainer') }, k))))),
    h('div', { class: 'row' }, field('Kind · up to 28', inp('kind', x?.kind, { maxlength: 28 })), field('Location', inp('loc', x?.location, { list: 'locs' })), datalist('locs', locs)),
    field('Sits on · another box\'s ID, optional', inp('on', x?.sitsOn, { list: 'boxids', class: 'in m' })), datalist('boxids', r.containers.filter((b) => b.id !== id).map((b) => b.id)),
    field('Notes', h('textarea', { class: 'in', name: 'notes' }, x?.notes || '')),
    x && field('ID · changing it means any printed label no longer matches', inp('id', x.id, { class: 'in m' })),
  ], (f) => {
    const name = f.name.value.trim(); if (!name) return 'Give the box a name.';
    const on = f.on.value.trim().toUpperCase();
    const er = x ? c.sitsOnError(r, x.id, on) : on && !c.getC(r, on) ? `There is no ${on}.` : '';
    if (er) return er; // checked before a number is used (TC-R04)
    let box = x;
    if (!box) box = c.addContainer(r, { name, kindOfBox: f.kob.value, kind: f.kind.value, location: f.loc.value, notes: f.notes.value });
    if (x && f.id.value.trim().toUpperCase() !== x.id) {
      if (!confirm(`Change ${x.id} to ${f.id.value.trim().toUpperCase()}? Any label already printed for ${x.id} will no longer match.`)) return 'ID not changed.';
      const e2 = c.renameContainer(r, x.id, f.id.value.trim().toUpperCase()); if (e2) return e2;
    }
    Object.assign(box, { name: name.slice(0, 20), kindOfBox: f.kob.value, kind: f.kind.value.trim().slice(0, 28), location: f.loc.value.trim(), notes: f.notes.value, sitsOn: on });
    S.box = box.id;
    change(() => {}, x ? 'all' : { containers: [box.id] });
  });
}
function drawersDialog(cid) {
  let type = 'D';
  const seg = h('div', { class: 'segc', role: 'group', 'aria-label': 'Kind' }, Object.entries(c.COMP_TYPES).map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(k === type), onclick: (e) => { type = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); } }, t)));
  openDialog(`Add compartments to ${cid}`, [seg,
    h('div', { class: 'row' }, field('How many', inp('n', 3, { type: 'number', min: 1, max: 99, inputmode: 'numeric' }))),
    field('Names, one per line, optional · up to 20 each', h('textarea', { class: 'in', name: 'names', placeholder: 'Pliers and cutters\nSockets 1/4 in' })),
    h('p', { class: 'small', style: 'margin:0' }, 'Drawers count from the top. Ones already numbered keep their numbers.')], (f) => {
    const n = Math.min(99, Math.max(1, parseInt(f.n.value, 10) || 1));
    const made = c.addCompartments(rec(), cid, type, n, f.names.value.split('\n'));
    if (!made.length) return 'This box has used all 99 numbers for that kind.';
    S.place = made[0].id; change(() => {}, { containers: [cid], compartments: made.map((k) => k.id) });
  }, 'Add');
}
function compDialog(id) {
  const k = c.getComp(rec(), id);
  openDialog(`Rename ${id}`, [field('Name · up to 20', inp('name', k.name, { maxlength: 20 })), field('Notes', h('textarea', { class: 'in', name: 'notes' }, k.notes || ''))], (f) => {
    k.name = f.name.value.trim().slice(0, 20); k.notes = f.notes.value; change(() => {}, { compartments: [id] });
  });
}
function retireDialog(cid) {
  const r = rec(), n = c.itemsIn(r, cid, true).length;
  openDialog(`Retire ${cid}?`, [h('p', { style: 'margin:0' }, `${cid} keeps its ID and it is never reused, because a label may still exist.`),
    n > 0 && field(`Its ${n} ${n === 1 ? 'tool goes' : 'tools go'} to`, inp('to', '', { list: 'boxids2', class: 'in m', placeholder: 'Loose' })), datalist('boxids2', r.containers.filter((b) => b.id !== cid && b.status === 'active').map((b) => b.id))], (f) => {
    const to = (f.to?.value || '').trim().toUpperCase() || null;
    if (to && !c.getC(r, to) && !c.getComp(r, to)) return `There is no ${to}.`;
    c.retireContainer(r, cid, to); change(() => {}, 'all');
  }, 'Retire');
}

// TC-R20, TC-R80: a tool, with its warranty details. Read-only on a phone (TC-R100).
function itemDialog(uid, preset = {}) {
  const r = rec(), it = uid ? c.getItem(r, uid) : null, w = it?.warranty || {};
  if (S.phone && it) {
    openDialog(it.name, [h('dl', { class: 'card' }, rd('Brand', it.brand || '—'), rd('Kind', it.kind || '—'), rd('Tier', it.tier), rd('Quantity', it.qty ?? '—'),
      rd('Serial number', h('span', { class: 'mono' }, w.serial || '—')), rd('Warranty ends', h('span', { class: 'mono' }, c.warrantyEnd(w) || '—'))),
      h('span', { class: 'path' }, c.pathText(r, it)), it.notes && h('p', { class: 'small', style: 'margin:0' }, it.notes)], null);
    return;
  }
  const places = [...r.containers.filter((b) => b.status === 'active').map((b) => b.id), ...r.compartments.map((k) => k.id)];
  const isCons = (it?.tier || preset.tier) === 'Consumable';
  const body = [
    h('div', { class: 'row' }, field('Name', inp('name', it?.name ?? preset.name, { required: true })), field('Brand', inp('brand', it?.brand, { list: 'brands' })), datalist('brands', [...BRANDS, 'Wera', 'Knipex'])),
    h('div', { class: 'row' }, field('Kind', inp('kind', it?.kind, { maxlength: 28 })),
      field('Tier', h('select', { class: 'in', name: 'tier' }, c.TIERS.map((t) => h('option', { value: t, selected: t === (it?.tier || preset.tier || 'Power') }, t)))),
      field('Quantity', inp('qty', it?.qty ?? 1, { type: 'number', min: 1, max: 999, inputmode: 'numeric', disabled: isCons }), 'qtyf')),
    h('div', { class: 'row' }, field('Where · box or compartment ID, empty for Loose', inp('place', it ? it.place || '' : preset.place || '', { list: 'places', class: 'in m' })), datalist('places', places),
      field('Loose at', inp('looseAt', it?.looseAt))),
    field('Notes', h('textarea', { class: 'in', name: 'notes' }, it?.notes || '')),
    h('fieldset', { class: 'war' }, h('legend', {}, 'Warranty · optional'),
      field('Serial number', inp('serial', w.serial, { maxlength: 40, class: 'in m' })), field('Bought', inp('bought', w.bought, { type: 'date' })), field('From', inp('seller', w.seller)),
      field('Price paid', inp('price', w.price)), field('Warranty, years', inp('years', w.years, { type: 'number', min: 0, max: 99, step: 0.5 })), field('Or end date', inp('end', w.end, { type: 'date' })),
      field('Registered', h('select', { class: 'in', name: 'reg' }, [['', 'Not recorded'], ['yes', 'Yes'], ['no', 'No'], ['not-needed', 'Not needed']].map(([v, t]) => h('option', { value: v, selected: v === (w.registered || '') }, t)))),
      field('Registration number', inp('regNo', w.regNo, { class: 'in m' })), field('Receipt link', inp('receipt', w.receipt, { type: 'url', placeholder: 'https://' }))),
    it && it.history.length > 0 && h('ul', { class: 'hist' }, it.history.slice(-5).map((x) => h('li', {}, `Moved from ${x.from} to ${x.to} on ${x.date}`))),
    it && h('button', { type: 'button', class: 'key stop', onclick: () => { dlg.close(); change(() => { it.status = 'retired'; }, { items: [it.uid] }); offerUndo(`Retired ${it.name}`, () => { it.status = 'active'; }); } }, 'Retire this tool'),
  ];
  openDialog(it ? 'Edit tool' : 'Add a tool', body, (f) => {
    const name = f.name.value.trim(); if (!name) return 'Give the tool a name.';
    const place = f.place.value.trim().toUpperCase() || null;
    if (place && !c.getC(r, place) && !c.getComp(r, place)) return `There is no ${place}. Use a box or compartment ID, or leave it empty for Loose.`;
    const tier = f.tier.value;
    const war = tier === 'Consumable' ? null : { serial: f.serial.value.trim(), bought: f.bought.value, seller: f.seller.value.trim(), price: f.price.value.trim(), years: f.years.value, end: f.end.value, registered: f.reg.value, regNo: f.regNo.value.trim(), receipt: f.receipt.value.trim() };
    const hasW = c.hasWarranty(war);
    let t = it;
    if (!t) t = c.addItem(r, { name, tier, qty: f.qty.value, place, source: 'Typed' });
    else if (place !== t.place) c.moveItems(r, [t.uid], place);
    let qty = tier === 'Consumable' ? null : c.clampQty(f.qty.value);
    if (hasW && qty > 1) { // TC-R82
      if (!confirm(`Warranty details belong to one tool. Split one ${name} off the ${qty}, and keep the other ${qty - 1} together?`)) return 'Set the quantity to 1, or clear the warranty details.';
      const rest = c.addItem(r, { name, brand: f.brand.value, kind: f.kind.value, tier, qty: qty - 1, place, looseAt: f.looseAt.value, notes: f.notes.value, source: t.source });
      qty = 1; void rest;
    }
    Object.assign(t, { name: name.slice(0, 60), brand: f.brand.value.trim(), kind: f.kind.value.trim().slice(0, 28), tier, qty, looseAt: place ? '' : f.looseAt.value.trim(), notes: f.notes.value, warranty: hasW ? war : null });
    change(() => {}, 'all');
  });
  const tierSel = dlg.querySelector('[name=tier]');
  tierSel.onchange = () => { const cons = tierSel.value === 'Consumable'; dlg.querySelector('[name=qty]').disabled = cons; dlg.querySelector('fieldset.war').hidden = cons; };
  dlg.querySelector('fieldset.war').hidden = isCons;
}

function moveDialog() {
  const r = rec(), uids = [...S.sel];
  const places = [...r.containers.filter((b) => b.status === 'active').map((b) => [b.id, b.name]), ...r.compartments.map((k) => [k.id, `${k.name || c.COMP_TYPES[k.type]} · ${c.getC(r, k.containerId)?.name || ''}`])];
  openDialog(`Move ${uids.length} ${uids.length === 1 ? 'tool' : 'tools'}`, [field('To · a box or drawer ID, or empty for Loose', inp('to', '', { list: 'mvplaces', class: 'in m' })),
    h('datalist', { id: 'mvplaces' }, places.map(([v, t]) => h('option', { value: v }, t)))], (f) => {
    const to = f.to.value.trim().toUpperCase() || null;
    if (to && !c.getC(r, to) && !c.getComp(r, to)) return `There is no ${to}.`;
    clearUndo();
    const undo = c.moveItems(r, uids, to);
    S.sel.clear(); commit({ items: uids }); render();
    offerUndo(`Moved ${undo.length} ${undo.length === 1 ? 'tool' : 'tools'} to ${to || 'Loose'}`, () => c.undoMove(r, undo));
  }, 'Move');
}
function setFieldDialog() {
  const r = rec(), uids = [...S.sel];
  openDialog(`Set a field on ${uids.length} ${uids.length === 1 ? 'tool' : 'tools'}`, [
    h('div', { class: 'row' }, field('Field', h('select', { class: 'in', name: 'k' }, [['brand', 'Brand'], ['kind', 'Kind'], ['tier', 'Tier'], ['notes', 'Notes'], ['looseAt', 'Loose at']].map(([v, t]) => h('option', { value: v }, t)))),
      field('Value', inp('v', '')))], (f) => {
    const k = f.k.value; let v = f.v.value.trim();
    if (k === 'tier') { v = c.TIERS.find((t) => t.toLowerCase() === v.toLowerCase()); if (!v) return 'Tier is Power, Hand or Consumable.'; }
    clearUndo();
    const before = uids.map((u) => [u, c.getItem(r, u)[k]]);
    for (const u of uids) c.getItem(r, u)[k] = v;
    S.sel.clear(); commit({ items: uids }); render();
    offerUndo(`Set ${k} on ${uids.length} ${uids.length === 1 ? 'tool' : 'tools'}`, () => { for (const [u, old] of before) c.getItem(r, u)[k] = old; });
  }, 'Set');
}

// ---------- start ----------
const mq = matchMedia(`(max-width:${c.PHONE_MAX}px)`);
S.phone = mq.matches;
mq.addEventListener('change', () => { S.phone = mq.matches; S.sel.clear(); S.tick = null; render(); });
(async () => {
  try { S.rec = await loadRecord(); } catch { S.saveFailed = true; }
  S.low = (await storageUse()) > 0.9;
  render();
})();
