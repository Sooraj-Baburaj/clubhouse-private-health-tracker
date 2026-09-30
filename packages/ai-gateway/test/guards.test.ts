import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_FEATURE_KEYS } from '@clubhouse/contracts';
import { FEATURES, isRegistered, registryEntries } from '../src';

const ROOT = resolve(import.meta.dirname, '../../..');
const SKIP = new Set(['node_modules', 'dist', '.static', '.vercel', '.turbo', '.git', '.data', 'design', 'coverage', 'playwright-report', 'test-results', '.cache']);
const ALLOWED_SDK_FILE = 'packages/ai-gateway/src/client.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT).map((p) => ({ rel: relative(ROOT, p), text: readFileSync(p, 'utf8') }));

describe('AI gateway boundary (SYS-AI-10)', () => {
  it('only client.ts imports the Anthropic SDK or calls the API host', () => {
    const offenders = files.filter(
      (f) =>
        f.rel !== ALLOWED_SDK_FILE &&
        !f.rel.endsWith('guards.test.ts') &&
        (/(from\s+|import\(\s*|require\(\s*)['"]@anthropic-ai\/sdk/.test(f.text) || /api\.anthropic\.com/.test(f.text)),
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it('no workspace package other than ai-gateway (and the hoisting root) depends on the SDK', () => {
    const manifests = ['apps/web', 'apps/admin', 'packages/contracts', 'packages/domain', 'packages/db', 'packages/server', 'packages/ui', 'e2e'].map((d) => ({ d, json: JSON.parse(readFileSync(join(ROOT, d, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } }));
    const bad = manifests.filter((m) => m.json.dependencies?.['@anthropic-ai/sdk'] || m.json.devDependencies?.['@anthropic-ai/sdk']).map((m) => m.d);
    expect(bad).toEqual([]);
  });
});

describe('feature registry (SYS-AI-30)', () => {
  it('registry keys equal the contract enum', () => {
    expect(Object.keys(FEATURES).sort()).toEqual([...AI_FEATURE_KEYS].sort());
    expect(registryEntries().map((e) => e.key)).toEqual([...AI_FEATURE_KEYS]);
  });

  it('every callFeature("<key>") literal in the codebase is registered', () => {
    const used = new Set<string>();
    for (const f of files.filter((x) => !x.rel.endsWith('guards.test.ts'))) for (const m of f.text.matchAll(/callFeature\(\s*['"]([^'"]+)['"]/g)) used.add(m[1]!);
    const unregistered = [...used].filter((k) => !isRegistered(k));
    expect(unregistered).toEqual([]);
  });

  it('every entry documents purpose, trigger, data sent and source file', () => {
    for (const e of registryEntries()) {
      expect(e.purpose.length).toBeGreaterThan(10);
      expect(e.trigger.length).toBeGreaterThan(5);
      expect(e.dataSent.length).toBeGreaterThan(10);
      expect(readFileSync(join(ROOT, e.sourceFile), 'utf8').length).toBeGreaterThan(0);
    }
  });
});
