import clsx from 'clsx';
import Link from 'next/link';

/** Logo teks: monogram + nama bisnis. */
export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <Link href="/" className={clsx('group flex items-center gap-3', className)} aria-label="Beranda — Jasa MC Hari Susanto">
      <span
        className={clsx(
          'grid size-10 place-items-center rounded-full border font-display text-[0.95rem] italic transition',
          light ? 'border-gold-400/60 text-gold-300 group-hover:border-gold-300' : 'border-gold-500/60 text-gold-600 group-hover:border-gold-500',
        )}
        aria-hidden
      >
        HS
      </span>
      <span className="leading-tight">
        <span className={clsx('block font-display text-[1.05rem]', light ? 'text-cream-50' : 'text-navy-900')}>Hari Susanto</span>
        <span className={clsx('block text-[0.62rem] font-semibold tracking-[0.24em] uppercase', light ? 'text-gold-400' : 'text-gold-600')}>
          Master of Ceremony
        </span>
      </span>
    </Link>
  );
}

/**
 * Bingkai potret. Menampilkan foto dari CMS (mc_profile.photo_url) bila sudah diunggah;
 * jika belum, monogram elegan — bukan foto stok orang lain.
 */
export function Portrait({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-sm">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[2rem] border border-gold-500/40" aria-hidden />
      <div className="relative h-full overflow-hidden rounded-[2rem] bg-gradient-to-b from-navy-800 to-navy-900 ring-1 ring-cream-50/10">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={`Foto ${name}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="grid size-36 place-items-center rounded-full border border-gold-400/50 bg-navy-950/40 sm:size-44">
              <span className="font-display text-6xl italic text-gold-300 sm:text-7xl">HS</span>
            </div>
            <div>
              <p className="font-display text-2xl text-cream-50">{name}</p>
              <p className="mt-1 text-xs font-semibold tracking-[0.24em] text-gold-400 uppercase">Master of Ceremony</p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy-950/60 to-transparent" aria-hidden />
      </div>
    </div>
  );
}
