import type { SampleRepository } from '@/database/repositories/SampleRepository';
import { createId } from '@/utils/id';

import { extensionOf, fileName, type FileStore } from '../storage/FileStore';

export type PhotoStatus = { kind: 'none' } | { kind: 'ok'; uri: string } | { kind: 'missing'; uri: string };

/**
 * Sample photos live only in private app storage (`<document>/photos`). SQLite stores the path.
 * Photos are never uploaded anywhere.
 */
export class PhotoStorage {
  constructor(
    private readonly fs: FileStore,
    private readonly samples: SampleRepository,
  ) {}

  get dir(): string {
    return this.fs.join(this.fs.rootUri, 'photos');
  }

  isManaged(uri: string): boolean {
    return uri.startsWith(`${this.dir}/`);
  }

  /** Copies a picked/captured image into private storage and returns its new URI. */
  async importPhoto(sourceUri: string): Promise<string> {
    await this.fs.ensureDir(this.dir);
    const dest = this.fs.join(this.dir, `${createId()}.${extensionOf(sourceUri)}`);
    await this.fs.copy(sourceUri, dest);
    return dest;
  }

  /** Sets or replaces a sample's photo. Old managed file is deleted only after the DB update succeeds. */
  async setSamplePhoto(sampleId: string, sourceUri: string): Promise<string> {
    const sample = await this.samples.getById(sampleId);
    if (!sample) throw new Error(`Sample ${sampleId} not found`);
    const newUri = await this.importPhoto(sourceUri);
    try {
      await this.samples.update(sampleId, { photoPath: newUri });
    } catch (e) {
      await this.fs.delete(newUri);
      throw e;
    }
    if (sample.photoPath && sample.photoPath !== newUri) await this.deleteIfManaged(sample.photoPath);
    return newUri;
  }

  async removeSamplePhoto(sampleId: string): Promise<void> {
    const sample = await this.samples.getById(sampleId);
    if (!sample) throw new Error(`Sample ${sampleId} not found`);
    if (!sample.photoPath) return;
    await this.samples.update(sampleId, { photoPath: null });
    await this.deleteIfManaged(sample.photoPath);
  }

  async status(photoPath: string | null): Promise<PhotoStatus> {
    if (!photoPath) return { kind: 'none' };
    return (await this.fs.exists(photoPath)) ? { kind: 'ok', uri: photoPath } : { kind: 'missing', uri: photoPath };
  }

  /** Deletes a sample and its managed photo file. */
  async deleteSample(sampleId: string): Promise<boolean> {
    const sample = await this.samples.getById(sampleId);
    if (!sample) return false;
    const ok = await this.samples.delete(sampleId);
    if (ok && sample.photoPath) await this.deleteIfManaged(sample.photoPath);
    return ok;
  }

  /** Removes managed photo files that no sample references. Returns deleted file names. */
  async cleanupOrphans(): Promise<string[]> {
    const referenced = new Set((await this.samples.listPhotoPaths()).map(fileName));
    const removed: string[] = [];
    for (const uri of await this.fs.list(this.dir)) {
      if (!referenced.has(fileName(uri))) {
        await this.fs.delete(uri);
        removed.push(fileName(uri));
      }
    }
    return removed;
  }

  private async deleteIfManaged(uri: string): Promise<void> {
    // Never delete files outside our private photo directory (e.g. gallery originals).
    if (this.isManaged(uri)) await this.fs.delete(uri);
  }
}
