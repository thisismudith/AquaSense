import { Directory, File, Paths } from 'expo-file-system';

import type { FileStore } from './FileStore';

/** FileStore backed by expo-file-system (SDK 54 object API). Private document directory only. */
export function createExpoFileStore(): FileStore {
  const rootUri = Paths.document.uri.replace(/\/+$/, '');
  return {
    rootUri,
    join: (...parts) => parts.map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, ''))).join('/'),
    async ensureDir(uri) {
      const d = new Directory(uri);
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
    },
    async exists(uri) {
      return new File(uri).exists || new Directory(uri).exists;
    },
    async copy(from, to) {
      new File(from).copy(new File(to));
    },
    async delete(uri) {
      const f = new File(uri);
      if (f.exists) f.delete();
    },
    async list(dirUri) {
      const d = new Directory(dirUri);
      if (!d.exists) return [];
      return d.list().map((e) => e.uri);
    },
    readText: (uri) => new File(uri).text(),
    async writeText(uri, text) {
      const f = new File(uri);
      if (!f.exists) f.create({ intermediates: true });
      f.write(text);
    },
    readBase64: (uri) => new File(uri).base64(),
    async writeBase64(uri, data) {
      const f = new File(uri);
      if (!f.exists) f.create({ intermediates: true });
      f.write(data, { encoding: 'base64' });
    },
  };
}
