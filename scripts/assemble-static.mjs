// Copies the two SPA builds into .static/ (member at /, admin at /admin/) for Vercel's outputDirectory.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '.static');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const web = resolve(root, 'apps/web/dist');
const admin = resolve(root, 'apps/admin/dist');
if (!existsSync(web)) throw new Error('apps/web/dist missing — run the web build first');
if (!existsSync(admin)) throw new Error('apps/admin/dist missing — run the admin build first');
cpSync(web, out, { recursive: true });
cpSync(admin, resolve(out, 'admin'), { recursive: true });
console.log('assembled .static/ (member + admin)');
