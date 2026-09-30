/**
 * Renders the PWA icons from logo 3b "Breakfast, lunch, dinner" (design/logos). Run: pnpm icons
 * oklch colours from the design are converted to sRGB because librsvg does not parse oklch().
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function oklch(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const lin = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S];
  const enc = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  };
  return `#${lin.map((x) => enc(x).toString(16).padStart(2, '0')).join('')}`;
}

const C = {
  ink: oklch(0.2, 0.015, 130),
  cream: oklch(0.975, 0.008, 105),
  limeDeep: oklch(0.6, 0.17, 132),
  limeBright: oklch(0.84, 0.19, 128),
  trackLight: oklch(0.93, 0.016, 110),
  trackDark: oklch(0.32, 0.015, 130),
  coral: oklch(0.66, 0.16, 30),
  coralBright: oklch(0.72, 0.15, 30),
};

/** The mark (viewBox 0 0 96 34): two closed rings and a third ring still filling. */
function mark(variant: 'light' | 'dark', stroke = 7) {
  const lime = variant === 'light' ? C.limeDeep : C.limeBright;
  const track = variant === 'light' ? C.trackLight : C.trackDark;
  const coral = variant === 'light' ? C.coral : C.coralBright;
  return `<g fill="none" stroke-width="${stroke}" stroke-linecap="round">
    <circle cx="17" cy="17" r="12" stroke="${lime}"/>
    <circle cx="48" cy="17" r="12" stroke="${lime}"/>
    <circle cx="79" cy="17" r="12" stroke="${track}"/>
    <circle cx="79" cy="17" r="12" stroke="${coral}" stroke-dasharray="45 76" transform="rotate(-90 79 17)"/>
  </g>`;
}

function tile(size: number, bg: string, variant: 'light' | 'dark', markWidthFraction: number, radius = 0) {
  const w = size * markWidthFraction;
  const scale = w / 96;
  const h = 34 * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${x} ${y}) scale(${scale})">${mark(variant)}</g>
</svg>`;
}

const out = resolve(import.meta.dirname, '../public/icons');
mkdirSync(out, { recursive: true });
const png = async (name: string, svg: string) => writeFileSync(resolve(out, name), await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());

await png('icon-192.png', tile(192, C.ink, 'dark', 0.72));
await png('icon-512.png', tile(512, C.ink, 'dark', 0.72));
await png('maskable-512.png', tile(512, C.ink, 'dark', 0.6));
await png('apple-touch-icon-180.png', tile(180, C.cream, 'light', 0.72));
await png('badge-96.png', `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g transform="translate(0 31)"><g fill="none" stroke-width="9" stroke="#ffffff"><circle cx="17" cy="17" r="12"/><circle cx="48" cy="17" r="12"/><circle cx="79" cy="17" r="12" stroke-dasharray="45 76" transform="rotate(-90 79 17)"/></g></g></svg>`);
writeFileSync(
  resolve(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${C.ink}"/><g transform="translate(6 31) scale(0.875)">${mark('dark', 9)}</g></svg>`,
);
writeFileSync(resolve(out, 'logo-mark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 34">${mark('light')}</svg>`);
console.log('icons written to', out, C);
