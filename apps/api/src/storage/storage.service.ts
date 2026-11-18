import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, type ReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { ENV, type Env } from '../config/env';

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ImageMime = keyof typeof IMAGE_TYPES;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MEDIA_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export const MEDIA_PREFIX = '/api/v1/media/';

/** Deteksi tipe dari isi file (magic bytes) — tidak mempercayai Content-Type atau ekstensi dari klien. */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** Bukti pembayaran: gambar atau PDF (struk/ bukti transfer). */
export const PROOF_TYPES = { ...IMAGE_TYPES, 'application/pdf': 'pdf' } as const;
export type ProofMime = keyof typeof PROOF_TYPES;
export const PROOF_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

export function sniffProof(buf: Buffer): ProofMime | null {
  const img = sniffImage(buf);
  if (img) return img;
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

/**
 * Penyimpanan file. Implementasi saat ini: disk lokal (dev / server tunggal).
 * Antarmuka sengaja kecil agar dapat diganti S3-compatible storage (R2/GCS/MinIO) di Phase 7.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : resolve(process.cwd(), env.STORAGE_DIR);
    mkdirSync(join(this.root, 'media'), { recursive: true });
    mkdirSync(join(this.root, 'private', 'proofs'), { recursive: true });
  }

  /** Bukti bayar disimpan di folder PRIVAT — tidak pernah dilayani oleh /media publik. */
  async saveProof(buf: Buffer, mime: ProofMime): Promise<string> {
    const key = `${randomUUID()}.${PROOF_TYPES[mime]}`;
    await writeFile(join(this.root, 'private', 'proofs', key), buf, { flag: 'wx' });
    return key;
  }

  openProof(key: string): { stream: ReadStream; size: number } | null {
    if (!PROOF_KEY_RE.test(key)) return null;
    const path = join(this.root, 'private', 'proofs', key);
    if (!existsSync(path)) return null;
    return { stream: createReadStream(path), size: statSync(path).size };
  }

  async saveImage(buf: Buffer, mime: ImageMime): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}.${IMAGE_TYPES[mime]}`;
    await writeFile(join(this.root, 'media', key), buf, { flag: 'wx' });
    return { key, url: `${MEDIA_PREFIX}${key}` };
  }

  open(key: string): { stream: ReadStream; size: number } | null {
    if (!MEDIA_KEY_RE.test(key)) return null; // mencegah path traversal
    const path = join(this.root, 'media', key);
    if (!existsSync(path)) return null;
    return { stream: createReadStream(path), size: statSync(path).size };
  }

  exists(key: string): boolean {
    return MEDIA_KEY_RE.test(key) && existsSync(join(this.root, 'media', key));
  }
}
