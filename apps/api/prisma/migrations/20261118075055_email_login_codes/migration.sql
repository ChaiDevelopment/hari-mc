-- CreateTable
CREATE TABLE "email_login_codes" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_login_codes_email_created_at_idx" ON "email_login_codes"("email", "created_at");

-- Email selalu lowercase; percobaan tidak negatif.
ALTER TABLE "email_login_codes"
  ADD CONSTRAINT "email_login_codes_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "email_login_codes_attempts_nonneg" CHECK ("attempts" >= 0);
