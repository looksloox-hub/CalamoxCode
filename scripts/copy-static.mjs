import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src', 'public');
const destDir = path.join(root, 'dist', 'public');

mkdirSync(destDir, { recursive: true });
cpSync(srcDir, destDir, { recursive: true });
console.log('[calamox] static assets copied to dist/public');
