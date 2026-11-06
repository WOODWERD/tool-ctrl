// The person's own GitHub repo (TC-R60 to TC-R71). Talks only to api.github.com, only for that repo.
// The token goes in a header, never in an address, and never into the record, a backup or the repo (TC-R62).
import { readBackup, writeBackup } from './core.js';

export const RECORD_PATH = 'tool-ctrl.json';
export const README_PATH = 'README.md';
export const APP_URL = 'https://woodwerd.github.io/tool-ctrl/';
const API = 'https://api.github.com';

export const repoError = (r) => (/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(String(r).trim()) ? '' : 'Enter the repo as owner/name, such as WOODWERD/tool-ctrl-record.');

export function toB64(text) {
  const bytes = new TextEncoder().encode(text); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// What went wrong, in plain words, and what to do (TC-R68, TC-S09)
export function explain(status, repo, what = '') {
  if (status === 0) return { kind: 'offline', text: 'GitHub can\'t be reached. Changes wait on this device and go when the connection is back.' };
  if (status === 401) return { kind: 'auth', text: `GitHub refused the token. It may have expired or been revoked. Make a new one for ${repo} with Contents read and write, and paste it here.` };
  if (status === 403) return { kind: 'rights', text: `The token can't ${what || 'use'} ${repo}. Give it Contents read and write for this repo, or wait if GitHub says too many requests.` };
  if (status === 404) return { kind: 'missing', text: `There is no repo ${repo} that this token can see. Check the name, and that the token covers this repo.` };
  return { kind: 'other', text: `GitHub answered ${status}. Nothing changed on this device; try Sync now in a minute.` };
}

export function client(repo, token, fetchFn = (...a) => fetch(...a)) {
  const call = async (path, opts = {}) => {
    let res;
    try {
      res = await fetchFn(`${API}/repos/${repo}${path}`, { ...opts, cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch { return { status: 0 }; }
    let json = null; try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  };
  return {
    // TC-R61, TC-E07: does the repo exist, is it private, can this token write?
    async check() {
      const r = await call('');
      if (r.status !== 200) return { error: explain(r.status, repo) };
      return { private: !!r.json.private, canWrite: !!r.json.permissions?.push, name: r.json.full_name || repo };
    },
    // TC-R63, TC-E09: the record file, or missing, or unreadable
    async read(path = RECORD_PATH) {
      const r = await call(`/contents/${path}`);
      if (r.status === 404) return { missing: true };
      if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
      let b64 = r.json.content;
      if (r.json.encoding === 'none' || !b64) { // files over 1 MB come back by blob
        const b = await call(`/git/blobs/${r.json.sha}`);
        if (b.status !== 200) return { error: explain(b.status, repo, 'read') };
        b64 = b.json.content;
      }
      return { text: fromB64(b64), sha: r.json.sha };
    },
    async readRecord() {
      const f = await this.read();
      if (f.missing || f.error) return f;
      const b = readBackup(f.text);
      if (b.error) return { error: { kind: 'unreadable', text: `${RECORD_PATH} in ${repo} isn't a Tool Ctrl record. Nothing on this device changed. Fix or remove the file on GitHub, then sync again.` } };
      return { record: b.record, sha: f.sha };
    },
    // TC-R66: GitHub refuses a write based on an old copy (409); the caller merges and tries again
    async write(path, text, sha, message) {
      const r = await call(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: toB64(text), ...(sha ? { sha } : {}) }) });
      if (r.status === 200 || r.status === 201) return { sha: r.json.content.sha };
      if (r.status === 409 || (r.status === 422 && /sha/i.test(r.json?.message || ''))) return { stale: true };
      return { error: explain(r.status, repo, 'write to') };
    },
    writeRecord(rec, sha, message) { return this.write(RECORD_PATH, writeBackup(rec), sha, message); },
    // TC-R170: the files in a folder, such as proposals/
    async list(path) {
      const r = await call(`/contents/${path}`);
      if (r.status === 404) return { files: [] };
      if (r.status !== 200 || !Array.isArray(r.json)) return { error: explain(r.status, repo, 'read') };
      return { files: r.json.filter((e) => e.type === 'file').map((e) => ({ name: e.name, path: e.path, sha: e.sha })) };
    },
    // TC-R171: a photo from the photo repo, as bytes, held only while shown
    async blob(sha) {
      const r = await call(`/git/blobs/${sha}`);
      if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
      const s = atob(String(r.json.content).replace(/\s/g, ''));
      const bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      return { bytes };
    },
  };
}

export const readme = (repo) => `# Tool Ctrl record

This private repo holds a [Tool Ctrl](${APP_URL}) record: tool boxes, the drawers in them and the tools in each.

- \`${RECORD_PATH}\` is written by Tool Ctrl. Edit it there, not by hand, unless you know the format.
- Each sync is one commit, so the history of every change is in this repo's commits.
- Keep this repo private. It can hold serial numbers and where tools are kept.

Repo: ${repo}
`;
