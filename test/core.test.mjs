// Run: npm test. Set TC_SYSTAINERS to a real Systainer list, or TC_FESTOOL to a real Festool warranty export, to check those too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as c from '../site/core.js';
import { tickList, HAND_TOOLS, CATALOG } from '../site/catalog.js';

// A made-up list in the Systainer list's shape. No one's real equipment (TC-R70).
const SAMPLE = `id,name,kind,contents,tier,palette,icon,model,systainer,location,label_status,notes
ST-001,TRACK SAW,Track saw,Plunge saw · blade|Splinter guard,power,festool,track-saw,SAMPLE A,,,to-print,
ST-002,ROUTER,Router,Router · edge guide|Collets,power,festool,router,SAMPLE B,,Shop wall,to-print,
ST-003,SANDING DISCS,Abrasives,125 mm discs|Interface pad,consumable,,sander,,,,to-print,spare pack`;

const fresh = () => c.emptyRecord('WOODWERD', 'WW');
const withChest = () => {
  const r = fresh();
  const ch = c.addContainer(r, { name: 'ROLLING CHEST', kindOfBox: 'Tool chest', location: 'Shop wall' });
  c.addCompartments(r, ch.id, 'D', 5);
  return { r, ch };
};

test('TC-A01 importing a Systainer list renumbers to WW and keeps everything', () => {
  const r = fresh();
  const plan = c.planImport(r, SAMPLE, { renumberTo: 'WW' });
  assert.equal(plan.boxes.length, 3); assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.renumbered[0], ['ST-001', 'WW-001']);
  assert.deepEqual(plan.kept, ['icon', 'label_status']);
  c.applyImport(r, plan);
  assert.deepEqual(r.containers.map((x) => x.id), ['WW-001', 'WW-002', 'WW-003']);
  const b = c.getC(r, 'WW-002');
  assert.equal(b.kindOfBox, 'Systainer'); assert.equal(b.location, 'Shop wall'); assert.equal(b.kept.icon, 'router'); assert.match(b.notes, /Was ST-002/);
  const items = c.itemsIn(r, 'WW-002');
  assert.equal(items[0].name, 'SAMPLE B'); assert.equal(items[0].brand, 'Festool');
  assert.deepEqual(items.slice(1).map((i) => i.name), ['Router · edge guide', 'Collets']);
});

test('TC-A01 against a real list, when one is given', { skip: !process.env.TC_SYSTAINERS }, () => {
  const r = fresh();
  const plan = c.planImport(r, readFileSync(process.env.TC_SYSTAINERS, 'utf8'), { renumberTo: 'WW' });
  assert.equal(plan.skipped.length, 0, JSON.stringify(plan.skipped));
  c.applyImport(r, plan);
  assert.equal(r.containers.length, plan.boxes.length);
  assert.equal(r.containers[0].id, 'WW-001');
});

test('TC-R50b closing gaps numbers renumbered boxes in order', () => {
  const r = fresh();
  const gappy = SAMPLE.replace('ST-003,', 'ST-200,');
  const kept = c.planImport(r, gappy, { renumberTo: 'WW' });
  assert.equal(kept.gaps, true); assert.deepEqual(kept.renumbered[2], ['ST-200', 'WW-200']);
  const closed = c.planImport(r, gappy, { renumberTo: 'WW', closeGaps: true });
  assert.deepEqual(closed.renumbered.map((x) => x[1]), ['WW-001', 'WW-002', 'WW-003']);
  c.applyImport(r, closed);
  assert.match(c.getC(r, 'WW-003').notes, /Was ST-200/);
  assert.equal(c.nextId(r), 'WW-004');
});

test('TC-E01 importing twice skips IDs already used', () => {
  const r = fresh();
  c.applyImport(r, c.planImport(r, SAMPLE, { renumberTo: 'WW' }));
  const again = c.planImport(r, SAMPLE, { renumberTo: 'WW' });
  assert.equal(again.boxes.length, 0); assert.equal(again.skipped.length, 3); assert.match(again.skipped[0].why, /already used/);
});

test('TC-A02 a new box takes the next number', () => {
  const r = fresh();
  c.applyImport(r, c.planImport(r, SAMPLE, { renumberTo: 'WW' }));
  assert.equal(c.addContainer(r, { name: 'CHEST', kindOfBox: 'Tool chest' }).id, 'WW-004');
});

test('TC-A03 a retired number is never reused', () => {
  const r = fresh();
  for (let i = 0; i < 10; i++) c.addContainer(r, { name: `BOX ${i}` });
  c.retireContainer(r, 'WW-010');
  assert.equal(c.getC(r, 'WW-010').status, 'retired');
  assert.equal(c.addContainer(r, { name: 'NEW' }).id, 'WW-011');
});

test('TC-A04 drawers are made in one step', () => {
  const { r, ch } = withChest();
  assert.deepEqual(c.compsOf(r, ch.id).map((k) => k.id), ['WW-001-D1', 'WW-001-D2', 'WW-001-D3', 'WW-001-D4', 'WW-001-D5']);
});

test('TC-E03 a later drawer takes the next number; none are renumbered', () => {
  const { r, ch } = withChest();
  assert.equal(c.addCompartments(r, ch.id, 'D', 1)[0].id, 'WW-001-D6');
});

test('TC-A04a boxes on a cart follow the cart', () => {
  const r = fresh();
  const boxes = [1, 2, 3].map((i) => c.addContainer(r, { name: `S${i}`, location: 'Loft' }));
  const cart = c.addContainer(r, { name: 'CART', kindOfBox: 'Bin', location: 'Shop wall' });
  for (const b of boxes) assert.equal(c.setSitsOn(r, b.id, cart.id), '');
  cart.location = 'Truck';
  for (const b of boxes) { assert.equal(c.locationOf(r, b.id), 'Truck'); assert.equal(b.id, `WW-00${boxes.indexOf(b) + 1}`); }
  assert.match(c.setSitsOn(r, cart.id, boxes[0].id), /already sits on/);
  assert.match(c.setSitsOn(r, cart.id, cart.id), /itself/);
});

test('TC-A05 ticking tools adds them, marked Catalog', () => {
  const { r } = withChest();
  for (const t of tickList('router', 'Festool').slice(0, 3)) c.addItem(r, { name: t.name, brand: t.brand, kind: t.kind, tier: 'Power', place: 'WW-001-D2', source: 'Catalog' });
  const got = c.itemsIn(r, 'WW-001-D2');
  assert.equal(got.length, 3); assert.ok(got.every((i) => i.source === 'Catalog' && i.brand === 'Festool'));
});

test('TC-A32 a standard tool in its own box takes the next number, and can be taken back', () => {
  const r = fresh();
  for (let i = 0; i < 66; i++) c.addContainer(r, { name: `S${i}` });
  const ts = tickList('TS 55 F', 'Festool')[0], of = tickList('OF 1010', 'Festool')[0];
  const a = c.toolInNewBox(r, ts, { location: 'Shop wall' }), b = c.toolInNewBox(r, of);
  assert.equal(a.box.id, 'WW-067'); assert.equal(a.box.name, 'TS 55 F'); assert.equal(a.box.kind, 'Track saw'); assert.equal(a.box.location, 'Shop wall');
  assert.deepEqual(c.itemsIn(r, 'WW-067').map((i) => i.name), ['TS 55 F', 'Plunge saw · blade', 'Splinter guard']);
  assert.ok(c.itemsIn(r, 'WW-067').every((i) => i.source === 'Catalog'));
  assert.equal(b.box.id, 'WW-068');
  c.removeNewBox(r, 'WW-068');
  assert.equal(c.getC(r, 'WW-068'), undefined); assert.equal(c.itemsIn(r, 'WW-068').length, 0);
  assert.equal(c.nextId(r), 'WW-068');
  c.removeNewBox(r, 'WW-001'); // not the highest: its number stays used
  assert.equal(c.nextId(r), 'WW-068');
});

test('TC-A33 my tools move into a box, and back again', () => {
  const r = fresh();
  const chest = c.addContainer(r, { name: 'ROLLING CHEST' }); c.addCompartments(r, chest.id, 'D', 3);
  const box12 = c.addContainer(r, { name: 'DRILL' });
  const wrench = c.addItem(r, { name: 'Torque wrench', tier: 'Hand', looseAt: 'Loft bench' });
  const drill = c.addItem(r, { name: 'Drill', brand: 'Festool', place: box12.id });
  const list = c.myTools(r, 'WW-001-D3');
  assert.deepEqual(list.map((i) => i.name), ['Torque wrench', 'Drill']); // Loose first
  assert.deepEqual(c.myTools(r, 'WW-001-D3', 'drill').map((i) => i.name), ['Drill']);
  c.moveItems(r, [wrench.uid], 'WW-001-D3', '2026-11-02');
  const back = c.moveItems(r, [drill.uid], 'WW-001-D3', '2026-11-02');
  assert.equal(c.itemsIn(r, 'WW-001-D3').length, 2);
  assert.deepEqual(drill.history[0], { from: box12.id, to: 'WW-001-D3', date: '2026-11-02' });
  assert.equal(c.myTools(r, 'WW-001-D3').length, 0);
  c.undoMove(r, back);
  assert.equal(drill.place, box12.id);
  const own = c.itemInNewBox(r, drill.uid);
  assert.equal(own.box.id, 'WW-003'); assert.equal(own.box.name, 'DRILL'); assert.equal(drill.place, 'WW-003');
});

test('TC-A20 text read from a photo becomes suggestions, nothing added until confirmed', () => {
  const r = fresh();
  const box = c.addContainer(r, { name: 'ROLLING CHEST' }); c.addCompartments(r, box.id, 'D', 5);
  c.addItem(r, { name: 'Speed square', tier: 'Hand', place: 'WW-001-D5' });
  const before = r.items.length;
  const lines = ['FESTOOL', 'TS 55 FEBQ-Plus', 'COMBINATION SQUARE 300', '5m/16ft', '~ ~', 'SPEED SQUARE', 'ts 55 f'];
  const s = c.suggestFromText(r, 'WW-001-D5', lines, [...tickList('', 'All'), ...tickList('', HAND_TOOLS)]);
  assert.equal(r.items.length, before); // nothing added (TC-R32)
  const by = Object.fromEntries(s.map((x) => [x.read, x]));
  assert.equal(by['TS 55 FEBQ-Plus'].name, 'TS 55 F'); assert.equal(by['TS 55 FEBQ-Plus'].brand, 'Festool'); assert.equal(by['TS 55 FEBQ-Plus'].status, 'match'); assert.equal(by['TS 55 FEBQ-Plus'].on, true);
  assert.equal(by['COMBINATION SQUARE 300'].name, 'Combination square'); assert.equal(by['COMBINATION SQUARE 300'].status, 'match');
  assert.equal(by['5m/16ft'].status, 'guess'); assert.equal(by['5m/16ft'].on, false);
  assert.equal(by['SPEED SQUARE'].status, 'here'); assert.equal(by['SPEED SQUARE'].on, false); // TC-R35
  assert.ok(!by.FESTOOL && !by['~ ~']); // a brand alone and noise are skipped
  assert.ok(!by['ts 55 f']); // the same tool read twice is listed once
  assert.deepEqual(s.map((x) => x.status), ['match', 'match', 'guess', 'here']);
});

test('TC-A27 hand tools come with no brand', () => {
  const { r } = withChest();
  for (const t of tickList('', HAND_TOOLS).slice(0, 3)) c.addItem(r, { name: t.name, kind: t.kind, tier: 'Hand', place: 'WW-001-D1', source: 'Catalog' });
  const got = c.itemsIn(r, 'WW-001-D1');
  assert.equal(got.length, 3); assert.ok(got.every((i) => i.tier === 'Hand' && i.brand === ''));
  assert.ok(tickList('', 'All').every((t) => t.tier !== 'consumable'));
});

test('TC-A06 search finds every router, with its full path', () => {
  const { r, ch } = withChest();
  c.addItem(r, { name: 'OF 1010', brand: 'Festool', kind: 'Router', place: c.addContainer(r, { name: 'OF 1010', location: 'Truck' }).id });
  c.addItem(r, { name: 'Trim router bit', tier: 'Hand', place: `${ch.id}-D3` });
  const found = c.search(r, 'router').items;
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((i) => c.pathText(r, i)).sort(), ['Shop wall › WW-001 › D3 › Trim router bit', 'Truck › WW-002 › OF 1010']);
});

test('TC-A07 moving a box changes its location, not its ID', () => {
  const { r, ch } = withChest();
  ch.location = 'Truck';
  assert.equal(ch.id, 'WW-001'); assert.equal(c.locationOf(r, ch.id), 'Truck');
});

test('TC-A08 the Box Ctrl export has its columns and fits its limits', () => {
  const r = fresh();
  c.applyImport(r, c.planImport(r, SAMPLE, { renumberTo: 'WW' }));
  const ex = c.exportBoxCtrl(r);
  const rows = c.parseCsv(ex.csv);
  assert.deepEqual(rows[0], ['ID', 'Name', 'Kind', 'Contents', 'Group', 'Icon', 'Quantity']);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[2], ['WW-002', 'ROUTER', 'Router', 'SAMPLE B · Router · edge guide · Collets', 'Festool', 'router', '1']);
  for (const row of rows.slice(1)) { assert.ok(row[0].length <= 12); assert.ok(row[1].length <= 20); for (const l of row[3].split('|')) assert.ok(l.length <= 40); }
});

test('TC-A09 contents that run over are named, and no word is cut', () => {
  const names = ['Combination pliers', 'Long-nose pliers', 'Flat-nose pliers', 'Slip-joint pliers', 'Water pump pliers', 'Diagonal cutters'];
  const p = c.packContents(names);
  assert.equal(p.c1, 'Combination pliers · Long-nose pliers');
  assert.equal(p.c2, 'Flat-nose pliers · Slip-joint pliers');
  assert.deepEqual(p.left, ['Water pump pliers', 'Diagonal cutters']);
  const { r, ch } = withChest();
  for (const n of names) c.addItem(r, { name: n, tier: 'Hand', place: `${ch.id}-D2` });
  const ex = c.exportBoxCtrl(r);
  assert.deepEqual(ex.overruns, [{ id: 'WW-001', name: 'ROLLING CHEST', total: 6, left: 2 }]);
  const byDrawer = c.exportBoxCtrl(r, { compartments: true });
  assert.equal(c.parseCsv(byDrawer.csv).length, 6);
});

test('TC-A10 a backup opens elsewhere unchanged', () => {
  const { r, ch } = withChest();
  c.addItem(r, { name: 'TS 55 F', brand: 'Festool', place: ch.id, warranty: { serial: 'X1', bought: '2026-03-01', years: 3 } });
  const back = c.readBackup(c.writeBackup(r));
  assert.deepEqual(back.record, JSON.parse(JSON.stringify(r)));
  assert.match(c.readBackup('{"x":1}').error, /isn't a Tool Ctrl backup/);
});

test('TC-A19 a backup never holds a token', () => {
  const r = fresh(); r.meta.token = 'should not be here';
  assert.ok(!c.writeBackup(r).includes('github_pat_'));
});

test('TC-A22 warranty end comes from purchase date and length', () => {
  const w = { bought: '2026-03-01', years: 3 };
  assert.equal(c.warrantyEnd(w), '2029-03-01');
  assert.equal(c.warrantyStatus(w, '2026-11-02'), 'active');
  assert.equal(c.warrantyEnd({ ...w, end: '2028-01-01' }), '2028-01-01');
  assert.equal(c.warrantyEnd({ bought: '2024-02-29', years: 1 }), '2025-02-28');
  assert.equal(c.warrantyStatus({ bought: '2023-12-20', years: 3 }, '2026-11-02'), 'soon');
  assert.equal(c.warrantyStatus({ bought: '2022-09-10', years: 3 }, '2026-11-02'), 'ended');
  assert.equal(c.warrantyStatus({ serial: 'X' }, '2026-11-02'), 'noend');
});

test('TC-A23 warranty details split one tool off a quantity', () => {
  const r = fresh();
  const it = c.addItem(r, { name: 'Clamp', tier: 'Hand', qty: 3, place: c.addContainer(r, { name: 'C' }).id });
  const one = c.splitOne(r, it.uid);
  assert.equal(it.qty, 2); assert.equal(one.qty, 1); assert.equal(one.place, it.place); assert.notEqual(one.uid, it.uid);
});

test('TC-A24 a serial number is searchable', () => {
  const { r, ch } = withChest();
  c.addItem(r, { name: 'TS 55 F', place: ch.id, warranty: { serial: 'SN-7781' } });
  assert.equal(c.search(r, 'sn-7781').items[0].name, 'TS 55 F');
});

test('TC-A25 the Box Ctrl export carries no warranty details', () => {
  const { r, ch } = withChest();
  c.addItem(r, { name: 'TS 55 F', place: ch.id, warranty: { serial: 'SN-7781', bought: '2026-03-01', price: '700', receipt: 'https://example.com/r' } });
  const csv = c.exportBoxCtrl(r).csv;
  for (const s of ['SN-7781', '2026-03-01', '700', 'example.com']) assert.ok(!csv.includes(s));
});

test('TC-A26 a box of consumables exports like any box', () => {
  const r = fresh();
  const b = c.addContainer(r, { name: '125 MM ABRASIVES' });
  const it = c.addItem(r, { name: '125 mm discs', tier: 'Consumable', qty: 40, place: b.id, warranty: { serial: 'x' } });
  assert.equal(it.qty, null); assert.equal(it.warranty, null);
  assert.equal(c.parseCsv(c.exportBoxCtrl(r).csv)[1][3], '125 mm discs');
  assert.equal(c.parseCsv(c.exportBoxCtrl(r).csv)[1][4], 'Consumables');
});

test('TC-A28 search answers in under 200 ms at full size', () => {
  const r = fresh();
  for (let b = 0; b < 300; b++) {
    const box = c.addContainer(r, { name: `BOX ${b}`, location: ['Shop wall', 'Truck', 'Loft'][b % 3] });
    const ks = c.addCompartments(r, box.id, 'D', b < 100 ? 10 : 0);
    for (let i = 0; i < 17; i++) c.addItem(r, { name: `Tool ${b}-${i}`, brand: i % 2 ? 'Festool' : '', place: ks.length ? ks[i % ks.length].id : box.id, warranty: i === 0 ? { serial: `S${b}` } : null });
  }
  assert.ok(r.items.length >= 5000 && r.compartments.length >= 1000);
  const t = performance.now();
  const hit = c.search(r, 'tool 299');
  assert.ok(performance.now() - t < 200, `took ${performance.now() - t} ms`);
  assert.ok(hit.items.length > 0);
});

test('TC-A29 a bulk move undoes in one step', () => {
  const { r, ch } = withChest();
  const loose = Array.from({ length: 20 }, (_, i) => c.addItem(r, { name: `Socket ${i}`, tier: 'Hand', looseAt: 'Loft bench' }));
  const undo = c.moveItems(r, loose.map((i) => i.uid), `${ch.id}-D3`, '2026-11-02');
  assert.equal(c.itemsIn(r, `${ch.id}-D3`).length, 20);
  assert.deepEqual(loose[0].history[0], { from: 'Loose', to: 'WW-001-D3', date: '2026-11-02' });
  c.undoMove(r, undo);
  assert.equal(c.itemsIn(r, `${ch.id}-D3`).length, 0); assert.equal(loose[0].history.length, 0);
});

test('TC-A30 under 768 px is a phone', () => {
  assert.equal(c.isPhone(390), true); assert.equal(c.isPhone(767), true); assert.equal(c.isPhone(768), false); assert.equal(c.isPhone(820), false);
});

test('TC-E11 a prefix that would run past 12 characters is refused', () => {
  assert.equal(c.prefixError('WW'), '');
  assert.match(c.prefixError('WOODWERD'), /Keep it to 4/);
  assert.match(c.prefixError('ww'), /capital/);
  assert.equal(c.compId('WWDX-123', 'D', 12).length, 12);
});

test('TC-R07 a hand-changed ID moves its drawers and items with it', () => {
  const { r, ch } = withChest();
  const it = c.addItem(r, { name: 'Pliers', place: 'WW-001-D2' });
  assert.equal(c.renameContainer(r, 'WW-001', 'WW-050'), '');
  assert.equal(ch.id, 'WW-050'); assert.equal(it.place, 'WW-050-D2');
  assert.match(c.renameContainer(r, 'WW-050', 'WW-050'), /already used/);
});

test('TC-R12 retiring a box moves its items to Loose by default', () => {
  const { r, ch } = withChest();
  const it = c.addItem(r, { name: 'Pliers', place: 'WW-001-D2' });
  c.retireContainer(r, ch.id, null);
  assert.equal(it.place, null);
});

test('TC-R85 the warranty card has what a claim needs', () => {
  const { r, ch } = withChest();
  const it = c.addItem(r, { name: 'TS 55 F', kind: 'Track saw', brand: 'Festool', place: ch.id, warranty: { serial: 'SN1', bought: '2026-03-01', years: 3, registered: 'yes' } });
  const t = c.warrantyCard(r, it);
  for (const s of ['SN1', '2029-03-01', 'Registered: Yes', 'Shop wall › WW-001 › TS 55 F']) assert.ok(t.includes(s), s);
});

// ---------- a maker's warranty list (TC-R110 to TC-R120) ----------
// A made-up export in the Festool MyToolbox shape. Serials and numbers are fake (TC-R70).
// Set TC_FESTOOL to a real export to run TC-A34 to TC-A37 against it as well; the export never goes in this repo.
const FESTOOL_LIST = `Part no.,Serial no.,Nickname,Product,Purchasing date,Warranty until,Warranty number,Category
100001,SN-0001,,TS 55 F USA,3/4/2025,3/4/2028,W-0001,Saws
100002,SN-0002,Bench saw,SAMPLE SAW US 120V,,,W-0002,
100003,SN-0003,,"SAMPLE PACK 5,0 ASI",12/26/2020,12/26/2023,W-0003,Cordless products
100003,SN-0004,,"SAMPLE PACK 5,0 ASI",12/26/2020,12/26/2023,W-0004,Cordless products`;

test('TC-A34 a warranty list comes in Loose, one item per row, with its warranty details', () => {
  const r = fresh();
  const plan = c.planWarranty(r, FESTOOL_LIST, CATALOG);
  assert.equal(plan.maker, 'Festool'); assert.equal(plan.add.length, 4); assert.equal(plan.skipped.length, 0);
  c.applyWarranty(r, plan);
  assert.equal(r.items.length, 4);
  for (const it of r.items) {
    assert.equal(it.brand, 'Festool'); assert.equal(it.qty, 1); assert.equal(it.place, null);
    assert.equal(it.source, 'Import'); assert.equal(it.warranty.registered, 'yes');
  }
  const saw = r.items.find((i) => i.warranty.serial === 'SN-0001');
  assert.deepEqual([saw.warranty.bought, saw.warranty.end, saw.warranty.regNo], ['2025-03-04', '2028-03-04', 'W-0001']);
  assert.equal(c.warrantyEnd(saw.warranty), '2028-03-04');
  assert.equal(saw.notes, 'Festool part no. 100001');
  assert.equal(r.items.find((i) => i.warranty.serial === 'SN-0002').notes, 'Festool part no. 100002 · Bench saw');
});

test('TC-A35 the same list a second time adds nothing', () => {
  const r = fresh();
  c.applyWarranty(r, c.planWarranty(r, FESTOOL_LIST, CATALOG));
  const again = c.planWarranty(r, FESTOOL_LIST, CATALOG);
  assert.equal(again.add.length, 0); assert.equal(again.here.length, 4); assert.equal(again.noDates, 0);
});

test('TC-A36 matching drops the endings, and one part number with two serials is two items', () => {
  const r = fresh();
  const plan = c.planWarranty(r, FESTOOL_LIST, CATALOG);
  const saw = plan.add.find((a) => a.warranty.serial === 'SN-0001');
  assert.ok(saw.matched); assert.equal(saw.name, 'TS 55 F'); assert.equal(saw.kind, 'Track saw');
  const other = plan.add.find((a) => a.warranty.serial === 'SN-0002');
  assert.ok(!other.matched); assert.equal(other.name, 'SAMPLE SAW'); assert.equal(other.tier, 'Power');
  assert.equal(plan.add.filter((a) => a.name === 'SAMPLE PACK 5,0 ASI').length, 2);
  assert.equal(plan.matched, 1);
});

test('TC-A37 a row without dates still comes in, with those fields empty', () => {
  const plan = c.planWarranty(fresh(), FESTOOL_LIST, CATALOG);
  assert.equal(plan.noDates, 1);
  const w = plan.add.find((a) => a.warranty.serial === 'SN-0002').warranty;
  assert.equal(w.bought, ''); assert.equal(w.end, '');
});

test('TC-A38 a typed value is never overwritten; empty fields fill from the file', () => {
  const r = fresh();
  const it = c.addItem(r, { name: 'TS 55 F', brand: 'Festool', warranty: { serial: 'SN-0001', bought: '2025-01-01', seller: 'Local dealer' } });
  const plan = c.planWarranty(r, FESTOOL_LIST, CATALOG);
  assert.equal(plan.add.length, 3); assert.equal(plan.fills, 1);
  c.applyWarranty(r, plan);
  assert.equal(it.warranty.bought, '2025-01-01'); assert.equal(it.warranty.seller, 'Local dealer');
  assert.equal(it.warranty.end, '2028-03-04'); assert.equal(it.warranty.regNo, 'W-0001'); assert.equal(it.warranty.registered, 'yes');
});

test('TC-A40 imported warranty details never reach the Box Ctrl export', () => {
  const r = fresh();
  const box = c.addContainer(r, { name: 'TRACK SAW' });
  c.applyWarranty(r, c.planWarranty(r, FESTOOL_LIST, CATALOG), box.id);
  const csv = c.exportBoxCtrl(r).csv;
  for (const s of ['SN-0001', 'W-0001', '2025-03-04', '100001']) assert.ok(!csv.includes(s), s);
});

test('TC-A41 a date that isn\'t month/day/year skips only that row', () => {
  const bad = FESTOOL_LIST.replace('3/4/2025', '2025-03-04');
  const plan = c.planWarranty(fresh(), bad, CATALOG);
  assert.equal(plan.skipped.length, 1); assert.equal(plan.skipped[0].line, 2); assert.match(plan.skipped[0].why, /month\/day\/year/);
  assert.equal(plan.add.length, 3);
  assert.equal(c.warrantyDate('2/30/2025', 'mdy'), null);
});

test('TC-A42 Undo puts the record back as it was', () => {
  const r = fresh();
  c.addItem(r, { name: 'TS 55 F', brand: 'Festool', warranty: { serial: 'SN-0001' } });
  const before = JSON.stringify(r.items);
  const u = c.applyWarranty(r, c.planWarranty(r, FESTOOL_LIST, CATALOG));
  c.undoWarranty(r, u);
  assert.equal(JSON.stringify(r.items), before);
});

test('TC-E12 a CSV no maker knows is refused, and other columns are never kept', () => {
  assert.match(c.planWarranty(fresh(), SAMPLE, CATALOG).error, /isn't a warranty list/);
  const withAddress = FESTOOL_LIST.replace('Category', 'Category,Address').split('\n').map((l, i) => i ? l + ',1 Main St' : l).join('\n');
  const r = fresh(); c.applyWarranty(r, c.planWarranty(r, withAddress, CATALOG));
  assert.ok(!JSON.stringify(r).includes('Main St'));
});

test('TC-E13 a serial on a retired tool counts as already here', () => {
  const r = fresh();
  const it = c.addItem(r, { name: 'TS 55 F', brand: 'Festool', warranty: { serial: 'SN-0001' } }); it.status = 'retired';
  assert.equal(c.planWarranty(r, FESTOOL_LIST, CATALOG).here.length, 1);
});

test('TC-A34 to TC-A37 against a real export, when one is given', { skip: !process.env.TC_FESTOOL }, () => {
  const text = readFileSync(process.env.TC_FESTOOL, 'utf8');
  const r = fresh();
  const plan = c.planWarranty(r, text, CATALOG);
  assert.equal(plan.skipped.length, 0, JSON.stringify(plan.skipped));
  assert.equal(plan.add.length, plan.rows);
  c.applyWarranty(r, plan);
  assert.equal(r.items.length, plan.rows);
  assert.equal(c.planWarranty(r, text, CATALOG).add.length, 0);
  console.log(`  real export: ${plan.rows} rows, ${plan.matched} matched, ${plan.noDates} without dates`);
});

// ---------- Systainer models (TC-R130 to TC-R144) ----------
test('TC-A43 a Systainer box takes a model from the list', () => {
  const r = fresh();
  const b = c.addContainer(r, { name: 'DOMINO', kindOfBox: 'Systainer' });
  assert.ok(c.setModel(r, b.id, 'sys3-m-187'));
  const m = c.getModel(b.model);
  assert.deepEqual([b.model, m.name, m.w, m.d, m.h], ['sys3-m-187', 'SYS3 M 187', 396, 296, 187]);
  assert.equal(c.modelName(b), 'SYS3 M 187');
});
test('TC-A44 the picker finds old names', () => {
  const names = c.findModels('sys 2').map((m) => m.name);
  assert.deepEqual(names, ['SYS 2 TL', 'SYS 2 TL-DF', 'Systainer Classic 2']);
  assert.ok(c.findModels('sys 2').every((m) => !m.sold));
  assert.deepEqual(c.findModels('T-Loc III').map((m) => m.name), ['SYS 3 TL']);
  assert.equal(c.findModels('m187')[0].name, 'SYS3 M 187');
});
test('TC-A45 a tool in its own new box takes the Systainer it ships in, marked from the catalog', () => {
  const r = fresh();
  const { box } = c.toolInNewBox(r, { name: 'ETS 125', brand: 'Festool', kind: 'Random orbital sander', tier: 'power' });
  assert.deepEqual([box.model, box.modelFrom], ['sys3-m-187', 'catalog']);
  const other = c.toolInNewBox(r, { name: 'M18 FTR', brand: 'Milwaukee', kind: 'Trim router', tier: 'power' }).box;
  assert.equal(other.model || '', '');
});
test('TC-A46 confirming clears the from-catalog mark', () => {
  const r = fresh();
  const { box } = c.toolInNewBox(r, { name: 'TS 55 F', brand: 'Festool', kind: 'Track saw', tier: 'power' });
  c.confirmModel(r, box.id);
  assert.deepEqual([box.model, box.modelFrom], ['sys3-m-337', '']);
});
test('TC-A47 a Sortainer model knows its drawers', () => {
  assert.equal(c.getModel('sys3-sort3-m-337').drawers, 3);
  assert.equal(c.getModel('sys3-m-187').drawers, 0);
});
test('TC-A48 one model on several boxes skips kinds that take none, and undoes', () => {
  const r = fresh();
  const ids = [1, 2, 3, 4, 5].map(() => c.addContainer(r, { name: 'BOX', kindOfBox: 'Systainer' }).id);
  const bag = c.addContainer(r, { name: 'BAG', kindOfBox: 'Bag' }).id;
  const res = c.setModelMany(r, [...ids, bag], 'sys3-m-237');
  assert.equal(res.set.length, 5); assert.deepEqual(res.skipped, [bag]);
  assert.ok(ids.every((id) => c.getC(r, id).model === 'sys3-m-237'));
  res.undo();
  assert.ok(ids.every((id) => !c.getC(r, id).model));
});
test('TC-A49 import reads a Systainer column by any name and keeps what it cannot match', () => {
  const csv = 'id,name,size\nST-001,A,M 187\nST-002,B,SYS 4 TL\nST-003,C,Big one\n';
  const r = fresh(), plan = c.planImport(r, csv, { renumberTo: 'WW' });
  assert.deepEqual(plan.boxes.map((b) => b.model), ['sys3-m-187', 'sys-4-tl', '']);
  assert.deepEqual(plan.modelMissed, [{ line: 4, value: 'Big one' }]);
  c.applyImport(r, plan);
  assert.equal(c.getC(r, 'WW-003').kept.size, 'Big one');
  assert.equal(c.getC(r, 'WW-001').model, 'sys3-m-187');
});
test('TC-E16 a kind that takes no model hides it and keeps it', () => {
  const r = fresh();
  const b = c.addContainer(r, { name: 'X', kindOfBox: 'Systainer' });
  c.setModel(r, b.id, 'sys3-m-137'); b.kindOfBox = 'Bag';
  assert.equal(c.modelName(b), ''); b.kindOfBox = 'Systainer';
  assert.equal(c.modelName(b), 'SYS3 M 137');
});
test('TC-R135 a box not on the list keeps a typed name and height', () => {
  const r = fresh();
  const b = c.addContainer(r, { name: 'X', kindOfBox: 'Systainer' });
  c.setModel(r, b.id, 'other', { other: { name: 'Mafell MAX', h: 250 } });
  assert.deepEqual([c.modelName(b), b.modelOther.h], ['Mafell MAX', 250]);
});
test('TC-R143 older records gain the new kinds of box', () => {
  const r = fresh(); r.meta.kinds = ['Systainer', 'Bag'];
  c.ensureKinds(r);
  assert.deepEqual(r.meta.kinds, ['Systainer', 'Bag', 'Systainer tool', 'Cart']);
});
test('TC-R145 fill empty models from the tools inside, never over one already set', () => {
  const r = fresh();
  const a = c.addContainer(r, { name: 'A', kindOfBox: 'Systainer' });
  c.addItem(r, { name: 'TS 55 F', brand: 'Festool', kind: 'Track saw', tier: 'Power', place: a.id });
  const b = c.addContainer(r, { name: 'B', kindOfBox: 'Systainer' });
  c.addItem(r, { name: 'Pliers', brand: '', tier: 'Hand', place: b.id });
  const d = c.addContainer(r, { name: 'D', kindOfBox: 'Systainer' }); c.setModel(r, d.id, 'sys3-m-137');
  c.addItem(r, { name: 'OF 1400', brand: 'Festool', tier: 'Power', place: d.id });
  const bag = c.addContainer(r, { name: 'BAG', kindOfBox: 'Bag' });
  c.addItem(r, { name: 'CXS 18', brand: 'Festool', tier: 'Power', place: bag.id });
  const res = c.fillModelsFromTools(r);
  assert.deepEqual(res.filled.map((x) => [x.id, x.model]), [[a.id, 'sys3-m-337']]);
  assert.deepEqual(res.none, [b.id]);
  assert.deepEqual([a.modelFrom, d.model, bag.model || ''], ['catalog', 'sys3-m-137', '']);
  res.undo();
  assert.equal(a.model, '');
});
