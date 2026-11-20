/**
 * Supabase keeps the session (access + refresh token) in a storage adapter.
 * The device keychain (expo-secure-store) is the right place for it, but a
 * single keychain entry is limited to about 2 KB on some devices while a
 * session can be larger. This adapter splits a value across several entries.
 *
 * Layout for key K: `K.n` holds the chunk count, `K.0` … `K.{n-1}` the chunks.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

/** Keychain keys may only contain letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedStorage(store: KeyValueStore): KeyValueStore {
  async function count(base: string): Promise<number> {
    const raw = await store.getItem(`${base}.n`);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  async function clear(base: string, n: number): Promise<void> {
    for (let i = 0; i < n; i++) await store.removeItem(`${base}.${i}`);
    await store.removeItem(`${base}.n`);
  }

  return {
    async getItem(key) {
      const base = safeKey(key);
      const n = await count(base);
      if (n === 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await store.getItem(`${base}.${i}`);
        if (part === null) return null; // incomplete write: treat as signed out
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const base = safeKey(key);
      const previous = await count(base);
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE)
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      if (chunks.length === 0) chunks.push('');
      for (let i = 0; i < chunks.length; i++) await store.setItem(`${base}.${i}`, chunks[i] ?? '');
      await store.setItem(`${base}.n`, String(chunks.length));
      for (let i = chunks.length; i < previous; i++) await store.removeItem(`${base}.${i}`);
    },

    async removeItem(key) {
      const base = safeKey(key);
      await clear(base, await count(base));
    },
  };
}
