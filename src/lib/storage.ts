/** localStorage adapter with an in-memory fallback so Node tests can use the
 *  same session/persona modules without a DOM. */

export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();

export const storage: KVStorage =
  typeof globalThis.localStorage !== "undefined"
    ? globalThis.localStorage
    : {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => {
          memory.set(k, v);
        },
        removeItem: (k) => {
          memory.delete(k);
        },
      };
