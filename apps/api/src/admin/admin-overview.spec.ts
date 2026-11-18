import { detectConflicts } from './admin-overview.service';
import { sniffImage } from '../storage/storage.service';

const H = 3_600_000;
const iv = (id: string, s: number, e: number, blocking: boolean) => ({ id, code: id, start: s * H, end: e * H, blocking });

describe('detectConflicts', () => {
  it('tumpang tindih vs hanya jeda perjalanan', () => {
    const r = detectConflicts([iv('a', 10, 12, true), iv('b', 11, 13, false), iv('c', 12.5, 14, false)], H);
    expect(r.get('b')).toEqual(expect.arrayContaining([{ id: 'a', code: 'a', type: 'OVERLAP' }]));
    expect(r.get('c')).toEqual([{ id: 'a', code: 'a', type: 'BUFFER' }]);
  });
  it('PENDING–PENDING tidak dianggap bentrok (belum mengunci jadwal)', () => {
    expect(detectConflicts([iv('a', 10, 12, false), iv('b', 10, 12, false)], H).size).toBe(0);
  });
  it('tepat sejauh jeda tidak bentrok', () => {
    expect(detectConflicts([iv('a', 10, 12, true), iv('b', 13, 14, true)], H).size).toBe(0);
  });
});

describe('sniffImage', () => {
  it('mengenali JPEG/PNG/WEBP dari isi, menolak lainnya', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('89504e470d0a1a0a', 'hex'))).toBe('image/png');
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('image/webp');
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
  });
});
