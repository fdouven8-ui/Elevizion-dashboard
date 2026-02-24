import { getUncachableGitHubClient } from '../server/services/githubClient';
import * as fs from 'fs';
import * as path from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.local', '.config', '.upm']);
const IGNORE_FILES = new Set(['.env', '.env.local', '.env.production']);

function getAllFiles(dir: string, base: string = ''): { relativePath: string; fullPath: string }[] {
  const results: { relativePath: string; fullPath: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.nix')) continue;
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
  const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz']);
  return binaryExts.has(path.extname(filePath).toLowerCase());
}

async function main() {
  const octokit = await getUncachableGitHubClient();
  const { data: user } = await octokit.users.getAuthenticated();
  const owner = user.login;
  const repo = 'Elevizion-dashboard';
  
  console.log(`Pushing to ${owner}/${repo}...`);
  
  const workDir = '/home/runner/workspace';
  const files = getAllFiles(workDir);
  console.log(`Found ${files.length} files to push`);
  
  let existingSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
    existingSha = ref.object.sha;
    console.log(`Existing main branch SHA: ${existingSha}`);
  } catch {
    console.log('No existing main branch, creating fresh');
  }

  const blobs: { path: string; sha: string; mode: '100644' }[] = [];
  const BATCH = 5;
  
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const promises = batch.map(async (file) => {
      try {
        const content = fs.readFileSync(file.fullPath);
        const encoding = isBinary(file.fullPath) ? 'base64' : 'utf-8';
        const contentStr = encoding === 'base64' ? content.toString('base64') : content.toString('utf-8');
        
        const { data: blob } = await octokit.git.createBlob({
          owner, repo,
          content: contentStr,
          encoding,
        });
        return { path: file.relativePath, sha: blob.sha, mode: '100644' as const };
      } catch (e: any) {
        console.error(`  SKIP ${file.relativePath}: ${e.message?.substring(0, 80)}`);
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) blobs.push(r);
    }
    
    const pct = Math.min(100, Math.round(((i + batch.length) / files.length) * 100));
    process.stdout.write(`\r  Uploading... ${pct}% (${Math.min(i + BATCH, files.length)}/${files.length})`);
  }
  
  console.log(`\nCreating tree with ${blobs.length} blobs...`);
  
  const { data: tree } = await octokit.git.createTree({
    owner, repo,
    tree: blobs,
  });
  
  console.log(`Tree created: ${tree.sha}`);
  
  const commitParams: any = {
    owner, repo,
    message: 'Full project backup - Elevizion Dashboard',
    tree: tree.sha,
  };
  if (existingSha) {
    commitParams.parents = [existingSha];
  }
  
  const { data: commit } = await octokit.git.createCommit(commitParams);
  console.log(`Commit created: ${commit.sha}`);
  
  try {
    await octokit.git.updateRef({
      owner, repo,
      ref: 'heads/main',
      sha: commit.sha,
      force: true,
    });
  } catch {
    await octokit.git.createRef({
      owner, repo,
      ref: 'refs/heads/main',
      sha: commit.sha,
    });
  }
  
  console.log(`\nPush compleet! https://github.com/${owner}/${repo}`);
}

main().catch(e => { console.error('FOUT:', e.message); process.exit(1); });
