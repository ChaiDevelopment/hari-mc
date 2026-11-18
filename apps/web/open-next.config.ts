import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Konfigurasi OpenNext untuk Cloudflare Workers.
 * Semua halaman dirender dinamis (data dari API), jadi cache ISR/R2 belum diperlukan.
 */
export default defineCloudflareConfig({});
