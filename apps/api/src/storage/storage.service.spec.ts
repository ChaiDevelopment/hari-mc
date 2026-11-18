import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { loadEnv } from '../config/env';
import { S3Driver, sniffProof } from './storage.service';

/** Client S3 tiruan: menyimpan objek di memori, meniru error NotFound seperti R2. */
function fakeS3() {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const calls: string[] = [];
  const notFound = () => Object.assign(new Error('not found'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
  const client = {
    send: async (cmd: unknown) => {
      if (cmd instanceof PutObjectCommand) {
        calls.push(`put ${cmd.input.Bucket}/${cmd.input.Key}`);
        objects.set(cmd.input.Key!, { body: cmd.input.Body as Buffer, type: cmd.input.ContentType! });
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        const o = objects.get(cmd.input.Key!);
        if (!o) throw notFound();
        return { Body: Readable.from(o.body), ContentLength: o.body.length };
      }
      if (cmd instanceof HeadObjectCommand) {
        if (!objects.has(cmd.input.Key!)) throw Object.assign(new Error('nf'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        return {};
      }
      throw new Error('unexpected command');
    },
  };
  return { client, objects, calls };
}

describe('S3Driver (Cloudflare R2)', () => {
  it('put/get/exists memakai bucket & key yang benar; objek tak ada → null/false', async () => {
    const { client, calls, objects } = fakeS3();
    const d = new S3Driver(client as never, 'hari-mc-files');
    await d.put('media/a.png', Buffer.from('png'), 'image/png');
    expect(calls).toEqual(['put hari-mc-files/media/a.png']);
    expect(objects.get('media/a.png')?.type).toBe('image/png');
    expect(await d.exists('media/a.png')).toBe(true);
    const got = await d.get('media/a.png');
    expect(got?.size).toBe(3);
    expect(await d.get('media/missing.png')).toBeNull();
    expect(await d.exists('private/proofs/missing.pdf')).toBe(false);
  });

  it('error selain not-found diteruskan (tidak disembunyikan)', async () => {
    const d = new S3Driver({ send: async () => Promise.reject(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })) } as never, 'b');
    await expect(d.get('media/x.png')).rejects.toThrow('denied');
  });
});

describe('konfigurasi storage', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_ACCESS_SECRET: 'x'.repeat(40) };
  it('STORAGE_DRIVER=s3 mewajibkan endpoint, bucket, dan kunci akses', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_ENDPOINT[\s\S]*S3_BUCKET[\s\S]*S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/);
    const env = loadEnv({ ...base, STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' });
    expect(env.S3_REGION).toBe('auto');
  });
  it('default tetap disk lokal', () => {
    expect(loadEnv(base).STORAGE_DRIVER).toBe('local');
  });
});

describe('sniffProof', () => {
  it('menerima PDF & gambar, menolak HTML', () => {
    expect(sniffProof(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffProof(Buffer.from('<html>'))).toBeNull();
  });
});
