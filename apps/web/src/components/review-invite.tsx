import { ExternalLink, Star } from 'lucide-react';

/**
 * Ajakan memberi ulasan di Google setelah acara selesai.
 * Ditampilkan untuk SEMUA pesanan yang selesai (tanpa menyaring pelanggan) dan tanpa imbalan,
 * sesuai kebijakan ulasan Google.
 */
export function ReviewInvite({ invite }: { invite: { url: string; direct: boolean } }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-navy-900 p-6 text-cream-50 shadow-lift" data-testid="review-invite">
      <div className="flex items-center gap-1 text-gold-400" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="size-5 fill-current" />
        ))}
      </div>
      <h2 className="mt-3 font-display text-2xl">Bagaimana acaranya?</h2>
      <p className="mt-2 text-sm leading-relaxed text-cream-200/80">
        Terima kasih telah mempercayakan acara Anda kepada Hari Susanto. Ceritakan pengalaman Anda di Google — ulasan Anda membantu keluarga lain memilih MC
        yang tepat.
      </p>
      <a
        href={invite.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-gold-500 px-5 text-[0.95rem] font-semibold text-navy-950 transition hover:bg-gold-400"
      >
        Beri ulasan di Google <ExternalLink className="size-4" aria-hidden />
      </a>
      {!invite.direct && <p className="mt-3 text-xs text-cream-200/60">Di halaman Google Maps, pilih “Tulis ulasan”.</p>}
    </div>
  );
}
