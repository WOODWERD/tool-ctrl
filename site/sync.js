// One sync with the data repo (TC-R64 to TC-R67, TC-R101). No page code: tested against a fake GitHub.
import { same, mergeRecords, commitMessage, diffRecords } from './core.js';
import { README_PATH, readme } from './github.js';

// Changes on this device that GitHub doesn't have yet (TC-R67)
export const waiting = (base, local) => (base ? diffRecords(base, local).total : 0);

// base: the record as last synced; sha: GitHub's version of it. A phone only reads (TC-R101).
export async function syncOnce({ gh, repo, local, base, sha, phone = false }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const rem = await gh.readRecord();
    if (rem.error) return { status: 'error', error: rem.error };
    if (rem.missing) {
      if (phone) return { status: 'error', error: { kind: 'empty', text: `There is no record in ${repo} yet. Connect a computer or iPad first; this phone only reads.` } };
      const w = await gh.writeRecord(local, null, 'Tool Ctrl: first record');
      if (w.stale) continue;
      if (w.error) return { status: 'error', error: w.error };
      const rd = await gh.read(README_PATH);
      if (rd.missing) await gh.write(README_PATH, readme(repo), null, 'Tool Ctrl: README');
      return { status: 'synced', record: local, base: local, sha: w.sha, message: 'Tool Ctrl: first record', wrote: true };
    }
    if (phone) return { status: 'synced', record: rem.record, base: rem.record, sha: rem.sha, wrote: false };
    if (rem.sha === sha && base) {
      if (same(local, base)) return { status: 'synced', record: local, base, sha, wrote: false };
      const message = commitMessage(base, local);
      const w = await gh.writeRecord(local, sha, message);
      if (w.stale) continue;
      if (w.error) return { status: 'error', error: w.error };
      return { status: 'synced', record: local, base: local, sha: w.sha, message, wrote: true };
    }
    const m = mergeRecords(base, local, rem.record);
    if (m.conflicts.length) return { status: 'conflict', merged: m.record, conflicts: m.conflicts, remote: rem.record, remoteSha: rem.sha, renamed: m.renamed };
    if (same(m.record, rem.record)) return { status: 'synced', record: m.record, base: rem.record, sha: rem.sha, wrote: false, renamed: m.renamed };
    const message = commitMessage(rem.record, m.record);
    const w = await gh.writeRecord(m.record, rem.sha, message);
    if (w.stale) { base = rem.record; local = m.record; sha = rem.sha; continue; }
    if (w.error) return { status: 'error', error: w.error };
    return { status: 'synced', record: m.record, base: m.record, sha: w.sha, message, wrote: true, renamed: m.renamed };
  }
  return { status: 'error', error: { kind: 'busy', text: 'GitHub kept changing while this synced. Try Sync now in a minute.' } };
}
