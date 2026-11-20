import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { te } from '../src/i18n/te';
import { interpolate } from '../src/i18n/translate';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('Telugu has exactly the same keys as English', () => {
    expect(keys(te).sort()).toEqual(keys(en).sort());
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const flat = (o: object, p = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : flat(v, `${p}${k}.`),
      );
    const teMap = new Map(flat(te));
    for (const [key, text] of flat(en))
      expect(placeholders(teMap.get(key) ?? ''), key).toBe(placeholders(text));
  });

  it('fills placeholders', () => {
    expect(interpolate('Namaste, {name}', { name: 'Lakshmi' })).toBe('Namaste, Lakshmi');
    expect(interpolate('{missing}', {})).toBe('{missing}');
  });
});
