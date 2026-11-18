import type { Portfolio } from '@prisma/client';
import { MEDIA_PREFIX } from './storage.service';

/** Bentuk publik konten portfolio (dipakai CMS dan landing page). */
export const portfolioView = (p: Portfolio) => ({
  id: p.id,
  title: p.title,
  caption: p.caption,
  mediaType: p.mediaType,
  url: p.storageKey ? `${MEDIA_PREFIX}${p.storageKey}` : p.externalUrl,
  thumbnailUrl: p.thumbnailKey ? `${MEDIA_PREFIX}${p.thumbnailKey}` : p.storageKey ? `${MEDIA_PREFIX}${p.storageKey}` : null,
  isExternal: !p.storageKey,
  sortOrder: p.sortOrder,
  isActive: p.isActive,
  createdAt: p.createdAt,
});
