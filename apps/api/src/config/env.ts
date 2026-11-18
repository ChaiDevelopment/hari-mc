import { z } from 'zod';

const csv = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = z
  .enum(['true', 'false', ''])
  .optional()
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    CORS_ORIGINS: z.string().optional().transform(csv),
    SWAGGER_ENABLED: bool,
    // Jumlah hop reverse proxy tepercaya (0 = akses langsung). Salah set → X-Forwarded-For bisa dipalsukan.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET minimal 32 karakter'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TTL_DAYS_CUSTOMER: z.coerce.number().int().min(1).max(90).default(30),
    REFRESH_TTL_DAYS_ADMIN: z.coerce.number().int().min(1).max(30).default(7),
    GOOGLE_CLIENT_IDS: z.string().optional().transform(csv),
    COOKIE_SECURE: bool,
    COOKIE_DOMAIN: z.string().optional().transform((v) => v || undefined),
    ADMIN_EMAIL: z.string().optional(),
    /**
     * HANYA untuk development/test lokal ketika Google OAuth Client ID belum tersedia.
     * Mengaktifkan POST /auth/dev-login (customer saja). Ditolak keras di production.
     */
    ENABLE_DEV_LOGIN: bool,
    /**
     * HANYA development: izinkan dev-login masuk ke akun ADMIN yang SUDAH diprovisioning lewat CLI
     * (belum terikat Google). Tidak pernah membuat admin. Butuh ENABLE_DEV_LOGIN juga. Ditolak di production.
     */
    ENABLE_DEV_ADMIN_LOGIN: bool,
    /** Folder penyimpanan upload (foto profil, portfolio) untuk LocalDiskStorage. */
    STORAGE_DIR: z.string().default('./storage'),

    /**
     * Pengiriman email (kode masuk). 'log' = TIDAK mengirim email; isi email ditulis ke konsol server dan
     * STORAGE_DIR/dev-mailbox (hanya development). 'smtp' = kirim sungguhan via SMTP.
     */
    EMAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool,
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('Hari Susanto MC <no-reply@localhost>'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.ENABLE_DEV_LOGIN) {
      ctx.addIssue({ code: 'custom', message: 'ENABLE_DEV_LOGIN tidak boleh aktif di production', path: ['ENABLE_DEV_LOGIN'] });
    }
    if (env.NODE_ENV === 'production' && env.ENABLE_DEV_ADMIN_LOGIN) {
      ctx.addIssue({ code: 'custom', message: 'ENABLE_DEV_ADMIN_LOGIN tidak boleh aktif di production', path: ['ENABLE_DEV_ADMIN_LOGIN'] });
    }
    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', message: 'SMTP_HOST wajib diisi bila EMAIL_TRANSPORT=smtp', path: ['SMTP_HOST'] });
    }
    if (env.ENABLE_DEV_ADMIN_LOGIN && !env.ENABLE_DEV_LOGIN) {
      ctx.addIssue({ code: 'custom', message: 'ENABLE_DEV_ADMIN_LOGIN membutuhkan ENABLE_DEV_LOGIN=true', path: ['ENABLE_DEV_ADMIN_LOGIN'] });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) ctx.addIssue({ code: 'custom', message: 'COOKIE_SECURE wajib true di production', path: ['COOKIE_SECURE'] });
      if (env.GOOGLE_CLIENT_IDS.length === 0) ctx.addIssue({ code: 'custom', message: 'GOOGLE_CLIENT_IDS wajib diisi di production', path: ['GOOGLE_CLIENT_IDS'] });
      if (env.CORS_ORIGINS.length === 0) ctx.addIssue({ code: 'custom', message: 'CORS_ORIGINS wajib diisi di production', path: ['CORS_ORIGINS'] });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Konfigurasi environment tidak valid:\n${msg}`);
  }
  return parsed.data;
}

/** Token injeksi untuk konfigurasi yang sudah divalidasi. */
export const ENV = Symbol('ENV');
