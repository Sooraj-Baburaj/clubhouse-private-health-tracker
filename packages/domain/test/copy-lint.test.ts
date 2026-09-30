/**
 * APP-FUN-03: user-facing copy never uses shaming words. Scans string literals and JSX text in both apps, the server's
 * messages, seeds and AI prompts' user-visible fallbacks.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BANNED_COPY_WORDS } from '../src/constants';

const root = resolve(import.meta.dirname, '../../..');
const DIRS = ['apps/web/src', 'apps/admin/src', 'packages/server/src/application', 'packages/db/src/seed/data', 'packages/ui/src', 'packages/domain/src'];
// Files that legitimately contain the words: the list itself and prompts that forbid them.
const ALLOW = [/domain\/src\/constants\.ts$/, /ai-gateway\//];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function userText(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const texts: string[] = [];
  for (const m of noComments.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) texts.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' '));
  for (const m of noComments.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) texts.push(m[1]!);
  // Only prose-like strings: contain a space or start with a capital letter (skips keys, class names, ids).
  return texts.filter((t) => /\s/.test(t.trim()) || /^[A-Z][a-z]/.test(t.trim())).filter((t) => !/^[\w\s:/.[\]()-]*$/.test(t) || /\s\w+\s/.test(t));
}

describe('copy lint', () => {
  it('uses none of the banned words in user-facing text', () => {
    const hits: string[] = [];
    const words = BANNED_COPY_WORDS.map((w) => new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'i'));
    for (const dir of DIRS) {
      for (const f of files(join(root, dir))) {
        if (ALLOW.some((r) => r.test(f))) continue;
        for (const t of userText(readFileSync(f, 'utf8'))) {
          // Tailwind class lists and CSS are not copy.
          if (/(^|\s)(bg|text|px|py|rounded|flex|grid|border)-/.test(t)) continue;
          for (const w of words) if (w.test(t)) hits.push(`${relative(root, f)}: "${t.trim().slice(0, 80)}"`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
