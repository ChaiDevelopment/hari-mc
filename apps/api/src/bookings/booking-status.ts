import type { ActorType, BookingStatus } from '@prisma/client';

/** Status yang mengunci jadwal (selaras dengan exclusion constraint `bookings_no_overlap`). */
export const BLOCKING_STATUSES: BookingStatus[] = ['ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'];

interface TransitionRule {
  to: BookingStatus;
  actors: ActorType[];
  action: string;
}

/** Aturan transisi status — sumber kebenaran tunggal (docs/ARCHITECTURE.md §4). */
export const TRANSITIONS: Record<BookingStatus, TransitionRule[]> = {
  PENDING: [
    { to: 'ACCEPTED', actors: ['ADMIN'], action: 'ACCEPT' },
    { to: 'REJECTED', actors: ['ADMIN'], action: 'REJECT' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], action: 'CANCEL' },
  ],
  ACCEPTED: [
    { to: 'WAITING_PAYMENT', actors: ['ADMIN', 'SYSTEM'], action: 'REQUEST_PAYMENT' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], action: 'CANCEL' },
  ],
  WAITING_PAYMENT: [
    { to: 'CONFIRMED', actors: ['ADMIN'], action: 'CONFIRM_PAYMENT' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], action: 'CANCEL' },
  ],
  CONFIRMED: [
    { to: 'IN_PROGRESS', actors: ['ADMIN'], action: 'START_EVENT' },
    { to: 'CANCELLED', actors: ['ADMIN'], action: 'CANCEL' },
  ],
  IN_PROGRESS: [{ to: 'COMPLETED', actors: ['ADMIN'], action: 'COMPLETE_EVENT' }],
  CANCELLED: [{ to: 'REFUNDED', actors: ['ADMIN'], action: 'REFUND' }],
  REJECTED: [],
  COMPLETED: [],
  REFUNDED: [],
};

export function findTransition(from: BookingStatus, to: BookingStatus, actor: ActorType): TransitionRule | undefined {
  return TRANSITIONS[from].find((r) => r.to === to && r.actors.includes(actor));
}

export type CustomerAction = 'CANCEL';

/** Aksi yang boleh dilakukan customer pada status tertentu (dipakai web & Android). */
export function customerActions(status: BookingStatus): CustomerAction[] {
  return findTransition(status, 'CANCELLED', 'CUSTOMER') ? ['CANCEL'] : [];
}

/** Kolom timestamp yang diisi saat masuk ke status tertentu. */
export const STATUS_TIMESTAMP: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: 'acceptedAt',
  REJECTED: 'rejectedAt',
  CONFIRMED: 'confirmedAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
  REFUNDED: 'refundedAt',
};
