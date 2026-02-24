import { getUncachableGitHubClient } from '../server/services/githubClient';
import * as fs from 'fs';
import * as path from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.local', '.config', '.upm', '.nix-profile', '.nix-defexpr']);
const IGNORE_FILES = new Set(['.env', '.env.local', '.env.production']);

function getAllFiles(dir: string, base: string = ''): { relativePath: string; fullPath: string }[] {
  const results: { relativePath: string; fullPath: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...getAllFiles(fullPath, relPath));
    } else {
      if (IGNORE_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.log')) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 50 * 1024 * 1024) continue;
        results.push({ relativePath: relPath, fullPath });
      } catch {}
    }
  }
  return results;
}

function isBinary(filePath: string): boolean {
  const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.svg']);
  return binaryExts.has(path.extname(filePath).toLowerCase());
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const octokit = await getUncachableGitHubClient();
  const { data: user } = await octokit.users.getAuthenticated();
  const owner = user.login;
  const repo = 'Elevizion-dashboard';

  console.log(`Pushing ALL files to ${owner}/${repo}...`);

  const workDir = '/home/runner/workspace';
  const allFiles = getAllFiles(workDir);
  console.log(`Total files found: ${allFiles.length}`);

  let existingSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
    existingSha = ref.object.sha;

    const { data: existingTree } = await octokit.git.getTree({ owner, repo, tree_sha: existingSha, recursive: 'true' });
    const existingPaths = new Set(existingTree.tree.map(t => t.path));
    console.log(`Already on GitHub: ${existingPaths.size} files`);

    const missing = allFiles.filter(f => !existingPaths.has(f.relativePath));
    console.log(`Missing files to upload: ${missing.length}`);

    if (missing.length === 0) {
      console.log('All files are already on GitHub!');
      return;
    }

    const blobs: { path: string; sha: string; mode: '100644' }[] = [];
    const failed: string[] = [];

    for (let i = 0; i < missing.length; i++) {
      const file = missing[i];
      let retries = 3;
      let success = false;

      while (retries > 0 && !success) {
        try {
          const content = fs.readFileSync(file.fullPath);
          const encoding = isBinary(file.fullPath) ? 'base64' : 'utf-8';
          const contentStr = encoding === 'base64' ? content.toString('base64') : content.toString('utf-8');

          const { data: blob } = await octokit.git.createBlob({
            owner, repo,
            content: contentStr,
            encoding,
          });
          blobs.push({ path: file.relativePath, sha: blob.sha, mode: '100644' });
          success = true;
        } catch (e: any) {
          retries--;
          if (e.status === 403 || e.message?.includes('rate limit')) {
            const wait = retries > 1 ? 10000 : 30000;
            console.log(`\n  Rate limited on ${file.relativePath}, waiting ${wait/1000}s...`);
            await sleep(wait);
          } else {
            console.log(`\n  Error ${file.relativePath}: ${e.message?.substring(0, 60)}`);
            if (retries > 0) await sleep(2000);
          }
        }
      }

      if (!success) failed.push(file.relativePath);

      if ((i + 1) % 3 === 0) await sleep(1500);
      const pct = Math.round(((i + 1) / missing.length) * 100);
      process.stdout.write(`\r  Progress: ${pct}% (${i + 1}/${missing.length})`);
    }

    console.log(`\n\nUploaded ${blobs.length} blobs, ${failed.length} failed`);
    if (failed.length > 0) {
      console.log('Failed files:', failed.join(', '));
    }

    if (blobs.length === 0) {
      console.log('No new blobs to commit.');
      return;
    }

    console.log('Creating tree...');
    const { data: tree } = await octokit.git.createTree({
      owner, repo,
      base_tree: existingSha,
      tree: blobs,
    });

    const { data: commit } = await octokit.git.createCommit({
      owner, repo,
      message: 'Add remaining project files - complete backup',
      tree: tree.sha,
      parents: [existingSha],
    });

    await octokit.git.updateRef({
      owner, repo,
      ref: 'heads/main',
      sha: commit.sha,
      force: true,
    });

    console.log(`\nPush compleet! ${blobs.length} bestanden toegevoegd.`);
    console.log(`https://github.com/${owner}/${repo}`);

  } catch (e: any) {
    console.error('Fout:', e.message);
    process.exit(1);
  }
}

main();
