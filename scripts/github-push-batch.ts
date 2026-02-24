import { getUncachableGitHubClient } from '../server/services/githubClient';
import * as fs from 'fs';
import * as path from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.local', '.config', '.upm']);
const IGNORE_FILES = new Set(['.env', '.env.local', '.env.production']);
const BATCH_SIZE = 80;

function getAllFiles(dir: string, base = ''): { rel: string; full: string }[] {
  const results: { rel: string; full: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) results.push(...getAllFiles(full, rel));
    } else {
      if (!IGNORE_FILES.has(entry.name) && !entry.name.endsWith('.log')) {
        try { if (fs.statSync(full).size < 50 * 1024 * 1024) results.push({ rel, full }); } catch {}
      }
    }
  }
  return results;
}

function isBinary(p: string) {
  return ['.png','.jpg','.jpeg','.gif','.ico','.woff','.woff2','.ttf','.eot','.mp4','.webm','.mp3','.pdf','.zip','.gz','.svg']
    .includes(path.extname(p).toLowerCase());
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const octokit = await getUncachableGitHubClient();
  const { data: user } = await octokit.users.getAuthenticated();
  const owner = user.login;
  const repo = 'Elevizion-dashboard';

  const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
  let currentSha = ref.object.sha;

  const { data: tree } = await octokit.git.getTree({ owner, repo, tree_sha: currentSha, recursive: 'true' });
  const onGH = new Set(tree.tree.map((t: any) => t.path));

  const allLocal = getAllFiles('/home/runner/workspace');
  const missing = allLocal.filter(f => !onGH.has(f.rel));

  console.log(`On GitHub: ${onGH.size} | Local: ${allLocal.length} | Missing: ${missing.length}`);
  if (missing.length === 0) { console.log('Alles staat al op GitHub!'); return; }

  const batch = missing.slice(0, BATCH_SIZE);
  console.log(`Uploading batch of ${batch.length} files...`);

  const blobs: { path: string; sha: string; mode: '100644' }[] = [];
  for (let i = 0; i < batch.length; i++) {
    const f = batch[i];
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        const content = fs.readFileSync(f.full);
        const enc = isBinary(f.full) ? 'base64' : 'utf-8';
        const str = enc === 'base64' ? content.toString('base64') : content.toString('utf-8');
        const { data: blob } = await octokit.git.createBlob({ owner, repo, content: str, encoding: enc });
        blobs.push({ path: f.rel, sha: blob.sha, mode: '100644' });
        ok = true;
      } catch (e: any) {
        if (e.status === 403 || e.message?.includes('rate limit')) {
          console.log(`\n  Rate limited, waiting 15s...`);
          await sleep(15000);
        } else {
          console.log(`\n  Error ${f.rel}: ${e.message?.substring(0, 60)}`);
          await sleep(3000);
        }
      }
    }
    if (!ok) console.log(`  FAILED: ${f.rel}`);
    if ((i + 1) % 2 === 0) await sleep(800);
    process.stdout.write(`\r  ${i + 1}/${batch.length}`);
  }

  if (blobs.length === 0) { console.log('\nNo blobs created'); return; }

  console.log(`\nCommitting ${blobs.length} files...`);
  const { data: newTree } = await octokit.git.createTree({ owner, repo, base_tree: currentSha, tree: blobs });
  const { data: commit } = await octokit.git.createCommit({
    owner, repo,
    message: `Add ${blobs.length} project files (batch)`,
    tree: newTree.sha,
    parents: [currentSha],
  });
  await octokit.git.updateRef({ owner, repo, ref: 'heads/main', sha: commit.sha, force: true });

  const remaining = missing.length - blobs.length;
  console.log(`Batch committed! ${blobs.length} files pushed. ${remaining} remaining.`);
  console.log(`https://github.com/${owner}/${repo}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
