import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { FileStore } from '../storage/FileStore';

export type ShareOutcome = { ok: true; uri: string } | { ok: false; reason: 'sharing_unavailable' | 'error'; message?: string; uri?: string };

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Writes export files to private storage and hands them to the Android share sheet (user decides where they go). */
export class ExportService {
  constructor(private readonly fs: FileStore) {}

  get dir(): string {
    return this.fs.join(this.fs.rootUri, 'exports');
  }

  async writeCsv(csv: string, name = `sipsure-results-${stamp()}.csv`): Promise<string> {
    await this.fs.ensureDir(this.dir);
    const uri = this.fs.join(this.dir, name);
    await this.fs.writeText(uri, csv);
    return uri;
  }

  async writePdf(html: string, name = `sipsure-report-${stamp()}.pdf`): Promise<string> {
    const { uri: tmp } = await Print.printToFileAsync({ html });
    await this.fs.ensureDir(this.dir);
    const uri = this.fs.join(this.dir, name);
    await this.fs.copy(tmp, uri);
    await this.fs.delete(tmp);
    return uri;
  }

  /** Opens the system print preview for the report (screen 29). */
  previewPdf(html: string): Promise<void> {
    return Print.printAsync({ html });
  }

  async share(uri: string, mimeType: string, dialogTitle: string): Promise<ShareOutcome> {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'sharing_unavailable', uri };
    try {
      await Sharing.shareAsync(uri, { mimeType, dialogTitle });
      return { ok: true, uri };
    } catch (e) {
      return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e), uri };
    }
  }

  async writeBackup(json: string): Promise<string> {
    const dir = this.fs.join(this.fs.rootUri, 'backups');
    await this.fs.ensureDir(dir);
    const uri = this.fs.join(dir, `sipsure-backup-${stamp()}.json`);
    await this.fs.writeText(uri, json);
    return uri;
  }
}
