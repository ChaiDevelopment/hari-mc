import { BookingStatus } from '@prisma/client';
import { BOOKING_CODE_RE, generateBookingCode } from './booking-code';
import { customerActions, findTransition, TRANSITIONS } from './booking-status';

describe('aturan transisi status', () => {
  it('alur utama sesuai spesifikasi', () => {
    expect(findTransition('PENDING', 'ACCEPTED', 'ADMIN')).toBeDefined();
    expect(findTransition('ACCEPTED', 'WAITING_PAYMENT', 'ADMIN')).toBeDefined();
    expect(findTransition('WAITING_PAYMENT', 'CONFIRMED', 'ADMIN')).toBeDefined();
    expect(findTransition('CONFIRMED', 'IN_PROGRESS', 'ADMIN')).toBeDefined();
    expect(findTransition('IN_PROGRESS', 'COMPLETED', 'ADMIN')).toBeDefined();
  });
  it('customer tidak bisa menerima/mengonfirmasi pesanannya sendiri', () => {
    expect(findTransition('PENDING', 'ACCEPTED', 'CUSTOMER')).toBeUndefined();
    expect(findTransition('WAITING_PAYMENT', 'CONFIRMED', 'CUSTOMER')).toBeUndefined();
  });
  it('customer hanya bisa membatalkan sebelum CONFIRMED', () => {
    expect(customerActions('PENDING')).toEqual(['CANCEL']);
    expect(customerActions('ACCEPTED')).toEqual(['CANCEL']);
    expect(customerActions('WAITING_PAYMENT')).toEqual(['CANCEL']);
    expect(customerActions('CONFIRMED')).toEqual([]);
    expect(customerActions('COMPLETED')).toEqual([]);
  });
  it('status final tidak punya transisi; setiap status terdefinisi', () => {
    for (const s of Object.values(BookingStatus)) expect(TRANSITIONS[s]).toBeDefined();
    expect(TRANSITIONS.REJECTED).toEqual([]);
    expect(TRANSITIONS.COMPLETED).toEqual([]);
    expect(TRANSITIONS.REFUNDED).toEqual([]);
  });
});

describe('generateBookingCode', () => {
  it('format HMC-YYMMDD-XXXXX dengan tanggal WIB', () => {
    const code = generateBookingCode(new Date('2026-11-16T18:00:00Z')); // 17 Nov 01:00 WIB
    expect(code).toMatch(BOOKING_CODE_RE);
    expect(code.startsWith('HMC-261117-')).toBe(true);
  });
  it('acak (tidak berulang dalam 1000 percobaan)', () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateBookingCode()));
    expect(set.size).toBe(1000);
  });
});
