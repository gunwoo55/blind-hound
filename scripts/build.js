import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    const to = join(dest, entry);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

copyFileSync(join(root, 'index.html'), join(dist, 'index.html'));
copyDir(join(root, 'src'), join(dist, 'src'));
copyFileSync(join(root, 'README.md'), join(dist, 'README.md'));
console.log('Built static site to dist/');
