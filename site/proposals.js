// From photos (TC-R170 to TC-R179): proposals Photo Ctrl's skill writes to the data repo's proposals/ folder
// (PH-R90 to PH-R93), turned into rows to review and applied to the record. No page code: tested on made-up records.
import { getC, addContainer, setModel, takesModel, addItem, moveItems, alreadyIn, getModel, formatId, nextNumber, parseId, LIMITS, getComp } from './core.js';

export const PROPOSAL_FORMAT = 1;
export const PROPOSALS_DIR = 'proposals';
const RANK = { Sure: 0, Likely: 1, Guess: 2 };
const sureOf = (v) => (v && v.sure in RANK ? v.sure : 'Guess');
const lowest = (...vs) => vs.filter(Boolean).reduce((a, v) => (RANK[sureOf(v)] > RANK[a] ? sureOf(v) : a), 'Sure');
const val = (v) => (v && v.value != null ? String(v.value) : '');
const ticks = (s) => s !== 'Guess'; // TC-R172: Sure and Likely ticked, Guess unticked
const norm = (s) => String(s || '').trim().toLowerCase();
const placeName = (rec, p) => { if (!p) return 'Loose'; const k = getComp(rec, p); return k ? k.id : p; };

// Proposals still to review, oldest first (TC-R170)
export const waitingProposals = (files) => files.filter((f) => f.json && (f.json.status || 'Waiting') === 'Waiting').sort((a, b) => (a.json.set < b.json.set ? -1 : 1));

// TC-R171 to TC-R177: one row per change, ticked by how sure it is
export function planProposal(rec, prop, modelName = (id) => getModel(id)?.name || id) {
  if (!prop || +prop.format > PROPOSAL_FORMAT) return { newer: true, rows: [] }; // TC-R178
  const rows = [];
  const prefix = rec.meta.prefix;
  let nextN = nextNumber(rec, prefix);
  const free = (id) => { const p = parseId(id); return !!p && !p.comp && (rec.meta.prefixes || [prefix]).includes(p.prefix) && !getC(rec, p.container); };
  const live = (id) => { const c = getC(rec, id); return c && c.status !== 'retired' ? c : null; };
  (prop.changes || []).forEach((ch, i) => {
    const where = ch.where || [];
    if (ch.type === 'newBox') {
      // The box is ticked by how sure it is that the box is there; a guessed model is shown but not set
      const name = val(ch.name), model = val(ch.model), sure = sureOf(ch.name), modelSure = sureOf(ch.model);
      const old = ch.oldLabel?.number ? String(ch.oldLabel.number).toUpperCase() : '';
      const keep = old && free(old) ? old : ''; // TC-R174
      const id = keep || formatId(prefix, nextN);
      if (!keep) nextN += 1;
      const known = model && getModel(model) ? model : '';
      rows.push({ key: `c${i}`, i, type: 'newBox', ref: ch.ref, what: 'New box', text: name || 'A box', sure, checked: ticks(sure), enabled: true,
        name: name.toUpperCase().slice(0, LIMITS.name), model: known && ticks(modelSure) ? known : '', kindOfBox: val(ch.kindOfBox) || 'Systainer',
        keep, keepTicked: !!keep, id, oldText: ch.oldLabel?.text || '', oldNumber: old && !keep ? old : '', notes: ch.notes || '',
        why: [known ? (ticks(modelSure) ? `Model ${modelName(known)} · ${modelSure}` : `Model looks like ${modelName(known)} · Guess, so it's left unset`) : '', keep ? `Its label says ${keep}` : `Gets ${id}, the next free number`].filter(Boolean).join(' · '), where });
    } else if (ch.type === 'model') {
      const c = getC(rec, ch.box), model = val(ch.model), sure = lowest(ch.model, ch.match); // a guessed match keeps the row unticked
      const base = { key: `c${i}`, i, type: 'model', box: ch.box, what: `Model for ${ch.box}`, text: modelName(model), model, sure, where };
      if (!c) rows.push({ ...base, checked: false, enabled: false, why: `${ch.box} isn't in your record.` });
      else if (c.status === 'retired') rows.push({ ...base, checked: false, enabled: true, why: `${ch.box} has been retired.` }); // TC-R177
      else if (!takesModel(c)) rows.push({ ...base, checked: false, enabled: false, why: `${c.kindOfBox} doesn't take a Systainer model.` });
      else if (c.model === model) rows.push({ ...base, checked: false, enabled: false, why: 'Already set.' });
      else if (c.model) rows.push({ ...base, checked: false, enabled: true, now: modelName(c.model), why: `Now ${modelName(c.model)}. Kept unless you tick this.` }); // TC-R176
      else rows.push({ ...base, checked: ticks(sure), enabled: true, why: `${c.id} · ${c.name} has no model yet.${ch.match && sureOf(ch.match) !== 'Sure' ? ` Matching this box to ${c.id} is ${sureOf(ch.match) === 'Guess' ? 'a guess' : 'likely'}.` : ''}` });
    } else if (ch.type === 'items') {
      (ch.items || []).forEach((it, j) => {
        const name = val(it.name), sure = sureOf(it.name), place = ch.box || null;
        const base = { key: `c${i}-${j}`, i, j, type: 'item', box: place, ref: ch.box ? '' : ch.ref, drawer: ch.drawer || '', what: 'Tool', text: name, sure,
          brand: it.brand || '', kind: it.kind || '', tier: it.tier || 'Power', qty: it.quantity || 1, textRead: it.name?.textRead || '', where: it.where || where };
        const target = place && ch.drawer ? `${place}-${ch.drawer}` : place;
        if (place && !getC(rec, place)) { rows.push({ ...base, checked: false, enabled: false, why: `${place} isn't in your record.` }); return; }
        if (place && !live(place)) { rows.push({ ...base, checked: false, enabled: true, why: `${place} has been retired.` }); return; }
        if (target && alreadyIn(rec, target, name, it.brand || '')) { rows.push({ ...base, checked: false, enabled: false, why: `Already here, in ${target}.` }); return; } // TC-R175
        // a tool for a box not yet in the record is elsewhere wherever it's recorded, Loose included
        const elsewhere = rec.items.find((x) => x.status === 'active' && norm(x.name) === norm(name) && (!target || x.place !== target));
        if (elsewhere) { rows.push({ ...base, checked: false, enabled: true, move: elsewhere.uid, why: `Recorded ${elsewhere.place ? 'in ' + placeName(rec, elsewhere.place) : 'with no box'}. Tick to move it here.` }); return; }
        rows.push({ ...base, checked: ticks(sure), enabled: true, why: it.catalog === false ? 'Not in the catalog; named as read.' : (it.name?.textRead ? `Read: ${it.name.textRead}` : '') });
      });
    } else if (ch.type === 'stack') {
      rows.push({ key: `c${i}`, i, type: 'stack', what: 'Stack', text: `${(ch.boxes || []).length} boxes${val(ch.on) ? ' on a ' + modelName(val(ch.on)) : ''}`, sure: lowest(ch.on, ...(ch.boxes || [])), checked: false, enabled: false, why: 'Reviewed in Stack Ctrl once its boxes are in your record.', where });
    }
  });
  return { newer: false, rows };
}

// TC-R173, TC-R174: put the ticked rows in. Returns what Undo, the proposal file and the message need.
export function applyRows(rec, prop, rows, today) {
  const added = {}, made = { boxes: [], models: [], items: [], moved: [] };
  for (const r of rows.filter((x) => x.type === 'newBox' && x.checked)) {
    const keep = r.keepTicked && r.keep ? parseId(r.keep) : null;
    const notes = [r.notes, r.oldNumber ? `Old label: ${r.oldNumber}` : '', r.keep && !r.keepTicked ? `Old label: ${r.keep}` : ''].filter(Boolean).join('\n');
    const c = addContainer(rec, { name: r.name, kindOfBox: r.kindOfBox, notes, ...(keep ? { prefix: keep.prefix, n: keep.n } : {}) });
    if (r.model) setModel(rec, c.id, r.model);
    if (r.ref) added[r.ref] = c.id;
    made.boxes.push(c.id);
  }
  for (const r of rows.filter((x) => x.type === 'model' && x.checked)) if (setModel(rec, r.box, r.model)) made.models.push(r.box);
  for (const r of rows.filter((x) => x.type === 'item' && x.checked)) {
    const box = r.box || added[r.ref];
    if (!box) continue; // its new box wasn't added
    const place = r.drawer && getComp(rec, `${box}-${r.drawer}`) ? `${box}-${r.drawer}` : box;
    if (r.move) { moveItems(rec, [r.move], place, today); made.moved.push(r.move); }
    else made.items.push(addItem(rec, { name: r.text, brand: r.brand, kind: r.kind, tier: r.tier, qty: r.qty, place, source: 'Photo' }).uid);
  }
  const actionable = rows.filter((x) => x.enabled);
  const done = actionable.filter((x) => x.checked).length;
  const status = done && done === actionable.length ? 'Accepted' : 'Partly accepted';
  return { added, made, status };
}

// PH-R92: the file stays as the record of what was proposed, with its status written in
export const reviewed = (prop, status, today, added = {}) => ({ ...prop, status, reviewed: today, ...(Object.keys(added).length ? { added: { ...(prop.added || {}), ...added } } : {}) });

export function summary(made) {
  const n = (k, one, many) => (made[k].length ? `${made[k].length} ${made[k].length === 1 ? one : many}` : '');
  return [n('boxes', 'new box', 'new boxes'), n('models', 'model', 'models'), n('items', 'tool', 'tools'), n('moved', 'tool moved', 'tools moved')].filter(Boolean).join(', ') || 'nothing';
}
