import type { FileStore } from '@/services/storage/FileStore';

/** In-memory FileStore for tests. Content stored as base64 strings. */
export function createMemoryFileStore(root = 'file:///data/app/files'): FileStore & { files: Map<string, string>; failWrites: boolean } {
  const files = new Map<string, string>();
  const dirs = new Set<string>([root]);
  const toB64 = (t: string) => Buffer.from(t, 'utf8').toString('base64');
  const store = {
    files,
    failWrites: false,
    rootUri: root,
    join: (...parts: string[]) => parts.map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, ''))).join('/'),
    async ensureDir(uri: string) {
      dirs.add(uri);
    },
    async exists(uri: string) {
      return files.has(uri) || dirs.has(uri);
    },
    async copy(from: string, to: string) {
      const v = files.get(from);
      if (v === undefined) throw new Error(`ENOENT ${from}`);
      files.set(to, v);
    },
    async delete(uri: string) {
      files.delete(uri);
    },
    async list(dir: string) {
      return [...files.keys()].filter((k) => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'));
    },
    async readText(uri: string) {
      const v = files.get(uri);
      if (v === undefined) throw new Error(`ENOENT ${uri}`);
      return Buffer.from(v, 'base64').toString('utf8');
    },
    async writeText(uri: string, t: string) {
      if (store.failWrites) throw new Error('disk full');
      files.set(uri, toB64(t));
    },
    async readBase64(uri: string) {
      const v = files.get(uri);
      if (v === undefined) throw new Error(`ENOENT ${uri}`);
      return v;
    },
    async writeBase64(uri: string, d: string) {
      if (store.failWrites) throw new Error('disk full');
      files.set(uri, d);
    },
  };
  return store;
}
