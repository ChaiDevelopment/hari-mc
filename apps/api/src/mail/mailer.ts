import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Abstraksi pengirim email — test dapat menggantinya dengan penangkap pesan. */
export abstract class Mailer {
  abstract readonly available: boolean;
  abstract send(msg: MailMessage): Promise<void>;
}

/**
 * - EMAIL_TRANSPORT=smtp → kirim sungguhan (Brevo, Resend, Mailgun, SES, Gmail app password, dll.).
 * - EMAIL_TRANSPORT=log  → hanya development: email TIDAK dikirim, melainkan dicetak ke konsol server dan
 *   disimpan sebagai file di STORAGE_DIR/dev-mailbox. Di production mode ini dinonaktifkan.
 */
@Injectable()
export class ConfiguredMailer extends Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly transporter: Transporter | null;
  private readonly mailboxDir: string;
  readonly available: boolean;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    const root = isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : resolve(process.cwd(), env.STORAGE_DIR);
    this.mailboxDir = join(root, 'dev-mailbox');
    if (env.EMAIL_TRANSPORT === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
      this.available = true;
    } else {
      this.transporter = null;
      this.available = env.NODE_ENV !== 'production';
    }
  }

  async send(msg: MailMessage): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return;
    }
    if (!this.available) throw new Error('Pengiriman email belum dikonfigurasi');
    mkdirSync(this.mailboxDir, { recursive: true });
    const file = join(this.mailboxDir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    writeFileSync(file, JSON.stringify({ ...msg, from: this.env.EMAIL_FROM, sentAt: new Date().toISOString() }, null, 2));
    this.logger.warn(`[DEV MAILBOX] Email ke ${msg.to} TIDAK dikirim (EMAIL_TRANSPORT=log). Isi:\n${msg.text}`);
  }
}
