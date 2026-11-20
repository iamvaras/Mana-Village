import * as SecureStore from 'expo-secure-store';
import { LANGUAGES, type Language } from '@mana/core';

const LANGUAGE_KEY = 'mv_language';

/** Language chosen before sign-in. After sign-in the profile's language wins. */
export async function loadLanguage(): Promise<Language | null> {
  const value = await SecureStore.getItemAsync(LANGUAGE_KEY).catch(() => null);
  return (LANGUAGES as readonly string[]).includes(value ?? '') ? (value as Language) : null;
}

export async function saveLanguage(language: Language): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language).catch(() => undefined);
}
