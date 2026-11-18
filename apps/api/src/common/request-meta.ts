import type { Request } from 'express';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 512),
  };
}
