// Produces .vercel/output (Vercel Build Output API v3): both SPAs as static files and the Hono API as one Node.js
// function bundled with esbuild. Native dependencies (sharp, argon2) stay external and are copied in via @vercel/nft
// so the Linux binaries installed on Vercel's build machine ship with the function.
import { build } from 'esbuild';
import { nodeFileTrace } from '@vercel/nft';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, '.vercel/output');
const staticDir = join(out, 'static');
const funcDir = join(out, 'functions/api.func');
const REGION = process.env.VERCEL_FUNCTION_REGION || 'bom1';

rmSync(out, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });
mkdirSync(funcDir, { recursive: true });

// 1. Static: member app at /, admin app at /admin.
const web = join(root, 'apps/web/dist');
const admin = join(root, 'apps/admin/dist');
for (const [dir, name] of [[web, 'apps/web'], [admin, 'apps/admin']]) if (!existsSync(dir)) throw new Error(`${name}/dist missing — run pnpm build:apps first`);
cpSync(web, staticDir, { recursive: true });
cpSync(admin, join(staticDir, 'admin'), { recursive: true });

// 2. Function bundle.
const EXTERNAL = ['sharp', '@node-rs/argon2'];
await build({
  entryPoints: [join(root, 'packages/server/src/vercel.ts')],
  outfile: join(funcDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  minify: false,
  legalComments: 'none',
  external: EXTERNAL,
  // CommonJS dependencies inside an ESM bundle still call require/__dirname.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);",
  },
  logLevel: 'warning',
});

// 3. Trace and copy the external native packages next to the bundle.
const { fileList } = await nodeFileTrace([join(funcDir, 'index.mjs')], { base: root, processCwd: root });
let copied = 0;
for (const rel of fileList) {
  if (!rel.startsWith('node_modules/')) continue;
  const src = join(root, rel);
  const dest = join(funcDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const st = statSync(src);
  if (st.isDirectory()) continue;
  cpSync(src, dest, { dereference: true });
  copied++;
}
writeFileSync(join(funcDir, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  join(funcDir, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 300, memory: 1024, regions: [REGION] }, null, 2),
);

// 4. Routing, headers and cron schedules.
const security = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(), microphone=()',
};
const immutable = { 'Cache-Control': 'public, max-age=31536000, immutable' };
const config = {
  version: 3,
  routes: [
    { src: '^/(.*)$', headers: security, continue: true },
    { src: '^/(?:admin/)?assets/(.*)$', headers: immutable, continue: true },
    { src: '^/(?:sw\\.js|workbox-[^/]+\\.js|manifest\\.webmanifest|admin/index\\.html|index\\.html)$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
    { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    { handle: 'filesystem' },
    { src: '^/admin(?:/.*)?$', dest: '/admin/index.html' },
    { src: '^/(?!api/).*$', dest: '/index.html' },
  ],
  crons: [
    { path: '/api/jobs/tick?source=vercel-daily', schedule: '0 22 * * *' },
    { path: '/api/jobs/daily', schedule: '30 0 * * *' },
  ],
};
writeFileSync(join(out, 'config.json'), JSON.stringify(config, null, 2));
console.log(`.vercel/output ready: static (member + admin), function api (${copied} traced native files), region ${REGION}`);
