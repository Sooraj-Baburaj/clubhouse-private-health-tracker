/** APP-FUN-04: numbers rounded for people. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtKcal(n: number): string {
  return `${fmtInt(n)} kcal`;
}

/** "about 1,850 kcal" — rounds to the nearest 10 above 100. */
export function aboutKcal(n: number): string {
  const r = Math.abs(n) >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
  return `about ${r.toLocaleString('en-IN')} kcal`;
}

export function fmtKg(n: number, digits = 1): string {
  return `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)} kg`;
}

export function fmtGrams(n: number): string {
  return `${Math.round(n)} g`;
}

export const KG_PER_LB = 0.45359237;
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  return { ft, inch: Math.round(totalIn - ft * 12) };
}
export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * 2.54 * 10) / 10;
}

export function displayWeight(kg: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? `${(Math.round(kgToLb(kg) * 10) / 10).toFixed(1)} lb` : fmtKg(kg);
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
