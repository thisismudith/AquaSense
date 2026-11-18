/** Minimal file-system contract so services are testable without native modules. */
export interface FileStore {
  /** Root of private app storage (e.g. file:///data/user/0/<pkg>/files/). Ends without slash. */
  readonly rootUri: string;
  join(...parts: string[]): string;
  ensureDir(uri: string): Promise<void>;
  exists(uri: string): Promise<boolean>;
  copy(fromUri: string, toUri: string): Promise<void>;
  delete(uri: string): Promise<void>;
  list(dirUri: string): Promise<string[]>;
  readText(uri: string): Promise<string>;
  writeText(uri: string, text: string): Promise<void>;
  readBase64(uri: string): Promise<string>;
  writeBase64(uri: string, data: string): Promise<void>;
}

export function fileName(uri: string): string {
  const i = uri.lastIndexOf('/');
  return i >= 0 ? uri.slice(i + 1) : uri;
}

export function extensionOf(uri: string, fallback = 'jpg'): string {
  const name = fileName(uri).split('?')[0] ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
}
