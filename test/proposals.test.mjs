// From photos (TC-R170 to TC-R179, TC-A60 to TC-A62). Made-up records only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../site/core.js';
import { planProposal, applyRows, reviewed, waitingProposals, summary } from '../site/proposals.js';

const v = (value, sure, textRead) => ({ value, sure, ...(textRead ? { textRead } : {}) });
function sample() {
  const r = c.emptyRecord('Sample Shop', 'WW');
  const a = c.addContainer(r, { name: 'DOMINO 500', kindOfBox: 'Systainer' }); c.setModel(r, a.id, 'sys3-m-187'); // WW-001
  const b = c.addContainer(r, { name: 'SANDING', kindOfBox: 'Systainer' }); // WW-002, no model
  c.addContainer(r, { name: 'OLD', kindOfBox: 'Systainer' }); c.retireContainer(r, 'WW-003');
  c.addItem(r, { name: 'DOMINO DF 500', brand: 'Festool', place: 'WW-001' });
  c.addItem(r, { name: 'CARVEX PS 420', brand: 'Festool', place: null });
  return { r, a, b };
}
const prop = (changes, extra = {}) => ({ format: 1, set: '2026-11-05-1928-stack-2', shows: 'Stack', status: 'Waiting', changes, ...extra });

test('TC-R172, TC-A62 Sure and Likely are ticked, Guess unticked', () => {
  const { r } = sample();
  const p = planProposal(r, prop([
    { type: 'newBox', ref: 'n1', name: v('XL DOMINOS', 'Sure'), model: v('sys-1-tl', 'Likely') },
    { type: 'newBox', ref: 'n2', name: v('DOMINO 500', 'Sure'), model: v('sys-2-tl', 'Guess') },
    { type: 'items', box: 'WW-002', items: [{ name: v('ETS EC 125/3', 'Sure') }, { name: v('LS 130', 'Likely') }, { name: v('RO 90', 'Sure') }, { name: v('Odd sander', 'Guess') }, { name: v('Pads', 'Guess') }] },
  ]));
  assert.deepEqual(p.rows.map((x) => x.checked), [true, true, true, true, true, false, false]);
  assert.equal(p.rows[1].model, ''); assert.match(p.rows[1].why, /left unset/); // a guessed model isn't set
  const res = applyRows(r, prop([]), p.rows, '2026-11-05');
  const tools = c.itemsIn(r, 'WW-002').map((i) => i.source);
  assert.deepEqual(tools, ['Photo', 'Photo', 'Photo']);
  assert.equal(res.status, 'Partly accepted');
  assert.equal(summary(res.made), '2 new boxes, 3 tools');
  assert.ok(!c.getC(r, res.added.n2).model);
});

test('TC-R03, TC-A60 a new box takes the next free number; an old label of another prefix goes to notes', () => {
  const { r } = sample();
  const p = planProposal(r, prop([{ type: 'newBox', ref: 'n1', name: v('ROUTER BITS', 'Sure'), oldLabel: { text: 'ST-014', number: 'ST-014' } }]));
  assert.equal(p.rows[0].id, 'WW-004'); assert.equal(p.rows[0].keep, '');
  const res = applyRows(r, prop([]), p.rows, '2026-11-05');
  assert.equal(res.added.n1, 'WW-004');
  assert.match(c.getC(r, 'WW-004').notes, /Old label: ST-014/);
});

test('TC-R174, TC-A61 a label with a free number of the owner\'s prefix keeps it', () => {
  const { r } = sample();
  const p = planProposal(r, prop([{ type: 'newBox', ref: 'n1', name: v('JIG SAW', 'Sure'), oldLabel: { text: 'WW-031', number: 'WW-031' } }]));
  assert.equal(p.rows[0].keep, 'WW-031'); assert.equal(p.rows[0].keepTicked, true);
  applyRows(r, prop([]), p.rows, '2026-11-05');
  assert.ok(c.getC(r, 'WW-031'));
  assert.equal(c.nextId(r), 'WW-032');
  const taken = planProposal(r, prop([{ type: 'newBox', name: v('X', 'Sure'), oldLabel: { number: 'WW-001' } }]));
  assert.equal(taken.rows[0].keep, ''); assert.equal(taken.rows[0].oldNumber, 'WW-001');
});

test('TC-R176 a different model shows both and stays unless ticked; an empty one is ticked', () => {
  const { r } = sample();
  const p = planProposal(r, prop([{ type: 'model', box: 'WW-001', model: v('sys-2-tl', 'Likely') }, { type: 'model', box: 'WW-002', model: v('sys-1-tl', 'Likely') }]));
  assert.equal(p.rows[0].checked, false); assert.equal(p.rows[0].now, 'SYS3 M 187');
  assert.equal(p.rows[1].checked, true);
  applyRows(r, prop([]), p.rows, '2026-11-05');
  assert.equal(c.getC(r, 'WW-001').model, 'sys3-m-187');
  assert.equal(c.getC(r, 'WW-002').model, 'sys-1-tl');
});

test('TC-R175 already here is not added twice; recorded elsewhere offers Move here, unticked', () => {
  const { r } = sample();
  const p = planProposal(r, prop([{ type: 'items', box: 'WW-001', items: [{ name: v('DOMINO DF 500', 'Likely') }] }, { type: 'items', box: 'WW-002', items: [{ name: v('CARVEX PS 420', 'Sure') }] }]));
  assert.equal(p.rows[0].enabled, false); assert.match(p.rows[0].why, /Already here/);
  assert.equal(p.rows[1].checked, false); assert.ok(p.rows[1].move);
  p.rows[1].checked = true;
  const before = r.items.length;
  applyRows(r, prop([]), p.rows, '2026-11-05');
  assert.equal(r.items.length, before);
  assert.equal(r.items.find((i) => i.name === 'CARVEX PS 420').place, 'WW-002');
});

test('TC-R177 a retired box says so and is unticked; a stack waits for Stack Ctrl', () => {
  const { r } = sample();
  const p = planProposal(r, prop([{ type: 'model', box: 'WW-003', model: v('sys-1-tl', 'Sure') }, { type: 'stack', boxes: [{ ref: 'n1' }, { box: 'WW-001' }] }]));
  assert.equal(p.rows[0].checked, false); assert.match(p.rows[0].why, /retired/);
  assert.equal(p.rows[1].enabled, false); assert.match(p.rows[1].why, /Stack Ctrl/);
});

test('tools for a new box go into it, and not at all if the box is left out', () => {
  const { r } = sample();
  const changes = [{ type: 'newBox', ref: 'n1', name: v('SYS DUO', 'Sure'), model: v('sys-3-tl', 'Likely') }, { type: 'items', box: null, ref: 'n1', items: [{ name: v('SYSLITE DUO', 'Likely') }] }];
  const p = planProposal(r, prop(changes));
  const res = applyRows(r, prop(changes), p.rows, '2026-11-05');
  assert.equal(r.items.find((i) => i.name === 'SYSLITE DUO').place, res.added.n1);
  const { r: r2 } = sample();
  const p2 = planProposal(r2, prop(changes)); p2.rows[0].checked = false;
  applyRows(r2, prop(changes), p2.rows, '2026-11-05');
  assert.equal(r2.items.find((i) => i.name === 'SYSLITE DUO'), undefined);
});

test('TC-R178, PH-R92 newer formats are left alone; status and new IDs are written back', () => {
  const { r } = sample();
  assert.equal(planProposal(r, { format: 2, changes: [] }).newer, true);
  const p = prop([]);
  const out = reviewed(p, 'Accepted', '2026-11-05', { n1: 'WW-004' });
  assert.equal(out.status, 'Accepted'); assert.equal(out.reviewed, '2026-11-05'); assert.equal(out.added.n1, 'WW-004');
  assert.equal(p.status, 'Waiting');
  const files = [{ json: { set: 'b', status: 'Waiting' } }, { json: { set: 'a' } }, { json: { set: 'c', status: 'Declined' } }];
  assert.deepEqual(waitingProposals(files).map((f) => f.json.set), ['a', 'b']);
});

test('TC-R175 a tool for a new box that is already recorded Loose offers Move here', () => {
  const { r } = sample();
  const changes = [{ type: 'newBox', ref: 'n1', name: v('JIG SAW', 'Sure') }, { type: 'items', box: null, ref: 'n1', items: [{ name: v('CARVEX PS 420', 'Likely') }] }];
  const p = planProposal(r, prop(changes));
  assert.equal(p.rows[1].checked, false); assert.ok(p.rows[1].move); assert.match(p.rows[1].why, /with no box/);
  p.rows[1].checked = true;
  const n = r.items.length;
  const res = applyRows(r, prop(changes), p.rows, '2026-11-05');
  assert.equal(r.items.length, n);
  assert.equal(r.items.find((i) => i.name === 'CARVEX PS 420').place, res.added.n1);
});
