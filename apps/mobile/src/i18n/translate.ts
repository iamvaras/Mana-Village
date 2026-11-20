import type { Language } from '@mana/core';
import { en, type Strings } from './en';
import { te } from './te';

export const STRINGS: Readonly<Record<Language, Strings>> = { en, te };

/** Replaces `{name}` placeholders with values. */
export function interpolate(text: string, vars?: Readonly<Record<string, string>>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
