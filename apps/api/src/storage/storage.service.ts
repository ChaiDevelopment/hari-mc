import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

/** Driver penyimpanan blob. Path selalu relatif: "media/<key>" atau "private/proofs/<key>". */
export interface BlobDriver {
  put(path: string, body: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<{ stream: Readable; size: number } | null>;
  exists(path: string): Promise<boolean>;
}

/** Disk lokal — development atau server dengan disk persisten. */
export class LocalDriver implements BlobDriver {
  constructor(private readonly root: string) {
    mkdirSync(join(root, 'media'), { recursive: true });
    mkdirSync(join(root, 'private', 'proofs'), { recursive: true });
  }
  async put(path: string, body: Buffer) {
    await writeFile(join(this.root, path), body, { flag: 'wx' });
  }
  async get(path: string) {
    const full = join(this.root, path);
    if (!existsSync(full)) return null;
    return { stream: createReadStream(full) as Readable, size: statSync(full).size };
  }
  async exists(path: string) {
    return existsSync(join(this.root, path));
  }
}

/** S3-compatible (Cloudflare R2, MinIO, AWS S3). Bucket boleh PRIVAT — file publik dialirkan lewat /api/v1/media. */
export class S3Driver implements BlobDriver {
  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
  ) {}
  async put(path: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: path, Body: body, ContentType: contentType }));
  }
  async get(path: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));
      if (!r.Body) return null;
      return { stream: r.Body as Readable, size: Number(r.ContentLength ?? 0) };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }
  async exists(path: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
}

function isNotFound(e: unknown): boolean {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;
}

export function createDriver(env: Env): BlobDriver {
  if (env.STORAGE_DRIVER === 's3') {
    const client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    });
    return new S3Driver(client, env.S3_BUCKET!);
  }
  return new LocalDriver(isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : resolve(process.cwd(), env.STORAGE_DIR));
}

/**
 * Penyimpanan file (foto profil, portfolio, bukti pembayaran).
 * STORAGE_DRIVER=local → disk; STORAGE_DRIVER=s3 → Cloudflare R2 / S3-compatible.
 * Kunci file selalu dibuat server (UUID) dan divalidasi regex → aman dari path traversal.
 */
@Injectable()
export class StorageService {
  private readonly driver: BlobDriver;

  constructor(@Inject(ENV) env: Env) {
    this.driver = createDriver(env);
  }

  /** Bukti bayar disimpan di prefix PRIVAT — tidak pernah dilayani oleh /media publik. */
  async saveProof(buf: Buffer, mime: ProofMime): Promise<string> {
    const key = `${randomUUID()}.${PROOF_TYPES[mime]}`;
    await this.driver.put(`private/proofs/${key}`, buf, mime);
    return key;
  }

  async openProof(key: string) {
    if (!PROOF_KEY_RE.test(key)) return null;
    return this.driver.get(`private/proofs/${key}`);
  }

  async saveImage(buf: Buffer, mime: ImageMime): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}.${IMAGE_TYPES[mime]}`;
    await this.driver.put(`media/${key}`, buf, mime);
    return { key, url: `${MEDIA_PREFIX}${key}` };
  }

  async open(key: string) {
    if (!MEDIA_KEY_RE.test(key)) return null; // mencegah path traversal
    return this.driver.get(`media/${key}`);
  }

  async exists(key: string): Promise<boolean> {
    return MEDIA_KEY_RE.test(key) && this.driver.exists(`media/${key}`);
  }
}
