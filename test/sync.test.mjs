// GitHub storage against a fake GitHub (TC-A13 to TC-A19). No real repo or token is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../site/core.js';
import { client, fromB64, RECORD_PATH, README_PATH } from '../site/github.js';
import { syncOnce, waiting } from '../site/sync.js';

const TOKEN = 'test-token-not-real';
const REPO = 'someone/tool-record';

// A small stand-in for api.github.com: one repo, files with shas, a token that can be revoked
function fakeGitHub({ isPrivate = true } = {}) {
  const files = new Map(); let n = 0; const calls = [];
  const gh = { files, calls, token: TOKEN, isPrivate, canWrite: true, down: false };
  gh.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', auth: opts.headers?.Authorization });
    if (gh.down) throw new TypeError('offline');
    const ok = (status, body) => ({ status, json: async () => body });
    if (opts.headers?.Authorization !== `Bearer ${gh.token}`) return ok(401, { message: 'Bad credentials' });
    const u = new URL(url);
    if (u.origin !== 'https://api.github.com') return ok(400, {});
    const path = u.pathname.replace(`/repos/${REPO}`, '');
    if (path === '') return ok(200, { full_name: REPO, private: gh.isPrivate, permissions: { push: gh.canWrite } });
    const file = path.replace('/contents/', '');
    if (!opts.method || opts.method === 'GET') {
      const f = files.get(file);
      return f ? ok(200, { sha: f.sha, content: f.b64, encoding: 'base64' }) : ok(404, { message: 'Not Found' });
    }
    if (!gh.canWrite) return ok(403, { message: 'Resource not accessible' });
    const body = JSON.parse(opts.body);
    const cur = files.get(file);
    if ((cur && body.sha !== cur.sha) || (!cur && body.sha)) return ok(409, { message: 'sha does not match' });
    const sha = `sha${++n}`;
    files.set(file, { sha, b64: body.content, message: body.message });
    return ok(cur ? 200 : 201, { content: { sha } });
  };
  return gh;
}
const text = (gh, f) => fromB64(gh.files.get(f).b64);
const recordOn = (gh) => JSON.parse(text(gh, RECORD_PATH)).record;

function device(name = 'WOODWERD') {
  const r = c.emptyRecord(name, 'WW');
  const ch = c.addContainer(r, { name: 'ROLLING CHEST', kindOfBox: 'Tool chest', location: 'Shop wall' });
  c.addCompartments(r, ch.id, 'D', 3);
  return r;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

test('TC-A14 connecting to an empty private repo writes the record and a README', async () => {
  const gh = fakeGitHub(), api = client(REPO, TOKEN, gh.fetch), local = device();
  assert.deepEqual(await api.check(), { private: true, canWrite: true, name: REPO });
  const s = await syncOnce({ gh: api, repo: REPO, local, base: null, sha: null });
  assert.equal(s.status, 'synced');
  assert.deepEqual(recordOn(gh), local);
  assert.match(text(gh, README_PATH), /woodwerd\.github\.io\/tool-ctrl/);
});

test('TC-A13 only api.github.com, for the data repo, and never the token in an address', async () => {
  const gh = fakeGitHub(), api = client(REPO, TOKEN, gh.fetch);
  await syncOnce({ gh: api, repo: REPO, local: device(), base: null, sha: null });
  assert.ok(gh.calls.length > 0);
  for (const call of gh.calls) {
    assert.ok(call.url.startsWith(`https://api.github.com/repos/${REPO}`), call.url);
    assert.ok(!call.url.includes(TOKEN));
    assert.equal(call.auth, `Bearer ${TOKEN}`);
  }
});

test('TC-A19 neither the repo nor a backup holds the token', async () => {
  const gh = fakeGitHub(), api = client(REPO, TOKEN, gh.fetch), local = device();
  await syncOnce({ gh: api, repo: REPO, local, base: null, sha: null });
  for (const [, f] of gh.files) assert.ok(!fromB64(f.b64).includes(TOKEN));
  assert.ok(!c.writeBackup(local).includes(TOKEN));
});

test('TC-A15 a box added on the iPad shows on the Mac after a sync', async () => {
  const gh = fakeGitHub();
  const mac = device(), macApi = client(REPO, TOKEN, gh.fetch);
  let m = await syncOnce({ gh: macApi, repo: REPO, local: mac, base: null, sha: null });
  const ipad = clone(m.record), ipadApi = client(REPO, TOKEN, gh.fetch);
  let i = { base: clone(m.record), sha: m.sha };
  c.addContainer(ipad, { name: 'CART', kindOfBox: 'Bin' });
  i = await syncOnce({ gh: ipadApi, repo: REPO, local: ipad, base: i.base, sha: i.sha });
  assert.equal(i.message, 'WW-002: 1 box added');
  m = await syncOnce({ gh: macApi, repo: REPO, local: m.record, base: m.base, sha: m.sha });
  assert.ok(c.getC(m.record, 'WW-002'));
});

test('TC-A16 changes made offline go up in one commit when the connection is back', async () => {
  const gh = fakeGitHub(), api = client(REPO, TOKEN, gh.fetch);
  let s = await syncOnce({ gh: api, repo: REPO, local: device(), base: null, sha: null });
  const local = clone(s.record);
  gh.down = true;
  for (const n of ['Pliers', 'Cutters', 'Wire stripper']) c.addItem(local, { name: n, tier: 'Hand', place: 'WW-001-D2' });
  const off = await syncOnce({ gh: api, repo: REPO, local, base: s.base, sha: s.sha });
  assert.equal(off.status, 'error'); assert.equal(off.error.kind, 'offline');
  assert.equal(waiting(s.base, local), 3);
  gh.down = false;
  const before = [...gh.files.values()].length;
  s = await syncOnce({ gh: api, repo: REPO, local, base: s.base, sha: s.sha });
  assert.equal(s.status, 'synced'); assert.equal(s.message, 'WW-001: 3 tools added');
  assert.equal([...gh.files.values()].length, before);
  assert.equal(c.itemsIn(recordOn(gh), 'WW-001-D2').length, 3);
  assert.equal(waiting(s.base, s.record), 0);
});

test('TC-A17 the same field changed on two devices asks which to keep', async () => {
  const gh = fakeGitHub();
  const start = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: device(), base: null, sha: null });
  const ipad = clone(start.record), mac = clone(start.record);
  ipad.containers[0].name = 'CHEST A';
  await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: ipad, base: start.base, sha: start.sha });
  mac.containers[0].name = 'CHEST B';
  mac.containers[0].location = 'Truck'; // a different field merges quietly
  const s = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: mac, base: start.base, sha: start.sha });
  assert.equal(s.status, 'conflict');
  assert.deepEqual(s.conflicts.map((x) => [x.key, x.field, x.local, x.remote]), [['WW-001', 'name', 'CHEST B', 'CHEST A']]);
  c.resolveConflict(s.merged, s.conflicts[0], 'remote');
  const done = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: s.merged, base: s.remote, sha: s.remoteSha });
  assert.equal(done.status, 'synced');
  assert.equal(recordOn(gh).containers[0].name, 'CHEST A'); assert.equal(recordOn(gh).containers[0].location, 'Truck');
});

test('TC-R66 a box added on two devices with the same number: the second takes the next number', async () => {
  const gh = fakeGitHub();
  const start = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: device(), base: null, sha: null });
  const ipad = clone(start.record), mac = clone(start.record);
  c.addContainer(ipad, { name: 'CART' });
  await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: ipad, base: start.base, sha: start.sha });
  const bag = c.addContainer(mac, { name: 'BAG', kindOfBox: 'Bag' });
  c.addItem(mac, { name: 'Tape measure', tier: 'Hand', place: bag.id });
  const s = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: mac, base: start.base, sha: start.sha });
  assert.equal(s.status, 'synced'); assert.deepEqual(s.renamed, [['WW-002', 'WW-003']]);
  const on = recordOn(gh);
  assert.equal(c.getC(on, 'WW-002').name, 'CART'); assert.equal(c.getC(on, 'WW-003').name, 'BAG');
  assert.equal(c.itemsIn(on, 'WW-003')[0].name, 'Tape measure');
});

test('TC-A18 a revoked token keeps the change on the device, and it syncs after a new token', async () => {
  const gh = fakeGitHub();
  let s = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: device(), base: null, sha: null });
  const local = clone(s.record);
  c.addItem(local, { name: 'Torque wrench', tier: 'Hand', place: 'WW-001-D3' });
  gh.token = 'new-token-not-real';
  const bad = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local, base: s.base, sha: s.sha });
  assert.equal(bad.status, 'error'); assert.equal(bad.error.kind, 'auth'); assert.match(bad.error.text, /refused the token/);
  assert.equal(c.itemsIn(local, 'WW-001-D3').length, 1);
  s = await syncOnce({ gh: client(REPO, 'new-token-not-real', gh.fetch), repo: REPO, local, base: s.base, sha: s.sha });
  assert.equal(s.status, 'synced'); assert.equal(c.itemsIn(recordOn(gh), 'WW-001-D3').length, 1);
});

test('TC-R101 a phone only reads, and never writes', async () => {
  const gh = fakeGitHub();
  const empty = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: device(), base: null, sha: null, phone: true });
  assert.equal(empty.error.kind, 'empty'); assert.equal(gh.files.size, 0);
  await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: device(), base: null, sha: null });
  const writes = gh.calls.filter((x) => x.method === 'PUT').length;
  const phone = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: c.emptyRecord(), base: null, sha: null, phone: true });
  assert.equal(phone.status, 'synced'); assert.equal(phone.record.containers.length, 1);
  assert.equal(gh.calls.filter((x) => x.method === 'PUT').length, writes);
});

test('TC-E07 a public repo is reported', async () => {
  const gh = fakeGitHub({ isPrivate: false });
  assert.equal((await client(REPO, TOKEN, gh.fetch).check()).private, false);
});

test('TC-E09 a file edited by hand into nonsense changes nothing here', async () => {
  const gh = fakeGitHub();
  await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local: device(), base: null, sha: null });
  gh.files.set(RECORD_PATH, { sha: 'x', b64: btoa('{"oops":') });
  const local = device();
  const s = await syncOnce({ gh: client(REPO, TOKEN, gh.fetch), repo: REPO, local, base: null, sha: null });
  assert.equal(s.status, 'error'); assert.equal(s.error.kind, 'unreadable'); assert.equal(local.containers.length, 1);
});
