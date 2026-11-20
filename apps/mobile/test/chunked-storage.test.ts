import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  createChunkedStorage,
  safeKey,
  type KeyValueStore,
} from '../src/lib/chunked-storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

describe('chunked secure storage', () => {
  it('round-trips a value larger than one keychain entry', async () => {
    const mem = memoryStore();
    const s = createChunkedStorage(mem);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    await s.setItem('sb-auth-token', value);
    expect(await s.getItem('sb-auth-token')).toBe(value);
    expect(mem.data.get('sb-auth-token.n')).toBe('3');
  });

  it('removes leftover chunks when a value shrinks', async () => {
    const mem = memoryStore();
    const s = createChunkedStorage(mem);
    await s.setItem('k', 'y'.repeat(CHUNK_SIZE * 3));
    await s.setItem('k', 'short');
    expect(await s.getItem('k')).toBe('short');
    expect([...mem.data.keys()].sort()).toEqual(['k.0', 'k.n']);
  });

  it('removeItem deletes every chunk', async () => {
    const mem = memoryStore();
    const s = createChunkedStorage(mem);
    await s.setItem('k', 'z'.repeat(CHUNK_SIZE + 1));
    await s.removeItem('k');
    expect(mem.data.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });

  it('treats a partly written value as missing', async () => {
    const mem = memoryStore();
    const s = createChunkedStorage(mem);
    await s.setItem('k', 'a'.repeat(CHUNK_SIZE + 1));
    mem.data.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });

  it('makes keys safe for the keychain', () => {
    expect(safeKey('sb-127.0.0.1:54321-auth-token')).toBe('sb-127.0.0.1_54321-auth-token');
  });
});
