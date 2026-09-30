import type { AppPrefs } from '@clubhouse/contracts';

const META_COLORS: Record<string, string> = { day: '#f7f7f1', night: '#15130f', organic: '#f5ead8', chili: '#f8f3ec', mango: '#fbf4e2', plum: '#f8f0ef' };

/** APP-NAV-09: light, dark and system themes; dark always resolves to the Night palette. */
export function applyTheme(prefs: AppPrefs) {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const palette = dark ? 'night' : prefs.palette === 'night' ? 'day' : prefs.palette;
  document.documentElement.dataset.palette = palette;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[palette] ?? '#f7f7f1');
  try {
    localStorage.setItem('ch:appPrefs', JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

export function watchSystemTheme(get: () => AppPrefs) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const h = () => get().theme === 'system' && applyTheme(get());
  mq.addEventListener('change', h);
  return () => mq.removeEventListener('change', h);
}
