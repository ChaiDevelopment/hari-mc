import type { BookingStatus, McProfile, NotificationItem, PaymentRecord, PaymentSummary } from './types';

export interface AdminBookingRow {
  id: string;
  code: string;
  status: BookingStatus;
  contactName: string;
  contactWhatsapp?: string;
  eventName: string;
  venueName: string;
  city: string;
  serviceName: string;
  eventStartAt: string;
  eventEndAt: string;
  timezone: string;
  totalAmount: string;
  hasPrice?: boolean;
  pendingPayments?: number;
  createdAt: string;
}

export interface AdminBookingList {
  items: AdminBookingRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<BookingStatus, number>;
}

export interface ConflictRef {
  id: string;
  code: string;
  status?: BookingStatus;
  contactName?: string;
  eventName?: string;
  start?: string;
  end?: string;
  blocking?: boolean;
  type: 'OVERLAP' | 'BUFFER';
}

export interface AdminBookingDetail {
  id: string;
  code: string;
  status: BookingStatus;
  allowedTransitions: Array<{ to: BookingStatus; action: string; reasonRequired: boolean }>;
  canRequestChanges: boolean;
  pricingEditable: boolean;
  service: { id: string; slug: string; name: string };
  customer: { id: string; name: string; email: string; avatarUrl: string | null; whatsapp: string | null; city: string | null };
  contact: { name: string; email: string; whatsapp: string };
  schedule: { start: string; end: string; timezone: string; durationMinutes: number; travelBufferMinutes: number };
  event: {
    eventName: string;
    venueName: string;
    address: string;
    city: string;
    mapsUrl: string | null;
    guestCount: number | null;
    concept: string | null;
    language: string | null;
    dressCode: string | null;
    rundown: string | null;
    activityDescription: string | null;
    specialRequests: string | null;
    additionalNotes: string | null;
  } | null;
  pricing: {
    packageName: string | null;
    packagePrice: string;
    durationMinutes: number | null;
    transportFee: string;
    additionalFee: string;
    additionalFeeNote: string | null;
    discountAmount: string;
    totalAmount: string;
    depositAmount: string;
    currency: string;
    hasPrice: boolean;
  };
  formAnswers: Record<string, string | number | boolean>;
  cancellationReason: string | null;
  rejectionReason: string | null;
  payments: PaymentRecord[];
  paymentSummary: PaymentSummary;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }>;
  conflicts: ConflictRef[];
  createdAt: string;
  updatedAt: string;
  timeline: Array<{ fromStatus: BookingStatus | null; toStatus: BookingStatus; action: string; actorType: 'CUSTOMER' | 'ADMIN' | 'SYSTEM'; actorName: string | null; note: string | null; createdAt: string }>;
}

export interface AdminDashboard {
  counts: { total: number; byStatus: Record<BookingStatus, number>; upcoming: number; pendingWithConflict: number; pendingPayments: number };
  upcoming: AdminBookingRow[];
  recent: AdminBookingRow[];
  agenda: Array<AdminBookingRow & { blocking: boolean }>;
  notifications: { items: NotificationItem[]; unread: number; total: number };
}

export interface CalendarEventDto extends AdminBookingRow {
  blocking: boolean;
  conflicts: ConflictRef[];
}

export interface AdminCustomerRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  whatsapp: string | null;
  city: string | null;
  createdAt: string;
  bookingCount: number;
  lastBookingAt: string | null;
  totalVerifiedPayments: string;
}

export interface AdminCustomerDetail {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  whatsapp: string | null;
  city: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  stats: { bookingCount: number; active: number; completed: number; cancelled: number; totalVerifiedPayments: string };
  bookings: AdminBookingRow[];
}

export interface AdminSettings {
  profile: McProfile;
  bookingRules: { travelBufferMinutes: number; minLeadTimeHours: number; maxAdvanceDays: number; confirmedAt: string | null };
  payment: { depositPolicy: { type: 'PERCENT' | 'FIXED'; value: number } | null; bankAccounts: Array<{ bankName: string; accountNumber: string; accountHolder: string }>; instructions: string | null };
  transport: { mode: 'UNSET' | 'FLAT' | 'PER_BOOKING'; flatAmount: number | null; notes: string | null };
  integrations: { googleReviews: { placeId?: string | null; mapsUrl?: string | null } | null; googleReviewLink: { url: string; direct: boolean } | null; instagram: Record<string, unknown> | null };
  bookingForm: { verifiedAgainstOriginalForm: boolean; legacyFormUrl: string | null };
}

export interface AdminService {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: { bookings: number; packages: number };
}

export interface AdminPackage {
  id: string;
  serviceId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  currency: string;
  facilities: string[];
  isActive: boolean;
  sortOrder: number;
  service: { name: string } | null;
}

export interface PortfolioItem {
  id: string;
  title: string | null;
  caption: string | null;
  mediaType: 'IMAGE' | 'VIDEO';
  url: string | null;
  thumbnailUrl: string | null;
  isExternal: boolean;
  sortOrder: number;
  isActive: boolean;
}

export const ADMIN_ACTION_LABEL: Record<string, string> = {
  ACCEPT: 'Terima pesanan',
  REJECT: 'Tolak pesanan',
  REQUEST_PAYMENT: 'Minta pembayaran',
  CONFIRM_PAYMENT: 'Konfirmasi pembayaran',
  START_EVENT: 'Mulai acara',
  COMPLETE_EVENT: 'Tandai selesai',
  CANCEL: 'Batalkan pesanan',
  REFUND: 'Tandai dana dikembalikan',
};
