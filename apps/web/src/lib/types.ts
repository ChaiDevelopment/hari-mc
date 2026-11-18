// Bentuk data dari API NestJS (apps/api). Decimal Prisma dikirim sebagai string.

export type Role = 'CUSTOMER' | 'ADMIN';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WAITING_PAYMENT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Package {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  currency: string;
  facilities: string[];
}

export interface Service {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  packages: Package[];
}

export interface McProfile {
  id: string;
  displayName: string;
  businessName: string;
  tagline: string | null;
  bio: string | null;
  locationLabel: string | null;
  photoUrl: string | null;
  instagramUrl: string | null;
  instagramHandle: string | null;
  googleMapsUrl: string | null;
  whatsappNumber: string | null;
  contactEmail: string | null;
}

export interface SiteData {
  profile: McProfile;
  services: Service[];
  globalPackages: Package[];
  faq: Array<{ question: string; answer: string }>;
  reviews: { source: 'google'; integrationActive: boolean; mapsUrl: string | null };
  instagram: { handle: string | null; profileUrl: string | null };
  portfolio: PortfolioPublic[];
}

export interface FormFieldConfig {
  key: string;
  label: string;
  type: string;
  required: boolean;
  core: boolean;
  enabled?: boolean;
  options?: string[];
  default?: string;
  helpText?: string;
}

export interface ExtraQuestion {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
  required?: boolean;
  options?: string[];
  helpText?: string;
}

export interface BookingFormConfig {
  version: number;
  verifiedAgainstOriginalForm: boolean;
  sections: Array<{ id: string; title: string; fields: FormFieldConfig[] }>;
  extraQuestions: ExtraQuestion[];
}

export interface BookingFormData {
  form: BookingFormConfig;
  rules: { minLeadTimeHours: number; maxAdvanceDays: number };
  services: Service[];
  globalPackages: Package[];
  timezones: Array<{ id: string; label: string }>;
}

export interface TimelineEntry {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  action: string;
  actorType: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  note: string | null;
  createdAt: string;
}

export interface BookingDetail {
  id: string;
  code: string;
  status: BookingStatus;
  allowedActions: Array<'CANCEL'>;
  service: { id: string; slug: string; name: string };
  schedule: { start: string; end: string; timezone: string; durationMinutes: number };
  contact: { name: string; email: string; whatsapp: string };
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
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];
  paymentInstructions?: { bankAccounts: Array<{ bankName: string; accountNumber: string; accountHolder: string }>; instructions: string | null; contactWhatsapp: string | null } | null;
  paymentSummary?: PaymentSummary;
  /** Ajakan ulasan Google — hanya untuk pesanan berstatus COMPLETED. direct=true → langsung ke form "Tulis ulasan". */
  reviewInvite?: { url: string; direct: boolean } | null;
  payments?: PaymentRecord[];
}

export interface PaymentSummary {
  totalAmount: number;
  depositAmount: number;
  confirmThreshold: number;
  verifiedPaid: number;
  pendingAmount: number;
  outstanding: number;
  dueNow: number;
  hasPendingPayment: boolean;
  canSubmitPayment: boolean;
}

export interface PaymentRecord {
  id: string;
  code: string;
  type: 'DOWN_PAYMENT' | 'SETTLEMENT' | 'REFUND';
  method: string;
  amount: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REFUNDED';
  paidAt: string;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  proof: { mimeType: string; fileName: string } | null;
}

export interface PortfolioPublic {
  id: string;
  title: string | null;
  caption: string | null;
  mediaType: 'IMAGE' | 'VIDEO';
  url: string | null;
  thumbnailUrl: string | null;
  isExternal: boolean;
}

export interface BookingListItem {
  id: string;
  code: string;
  status: BookingStatus;
  serviceName: string;
  eventName: string;
  venueName: string;
  city: string;
  eventStartAt: string;
  eventEndAt: string;
  timezone: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BookingSummary {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  nextEvent: BookingListItem | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { bookingId?: string; code?: string };
  readAt: string | null;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  whatsapp: string | null;
  city: string | null;
}
