import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { ENV, type Env } from '../config/env';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/** Abstraksi agar test bisa mengganti verifier tanpa memanggil Google. */
export abstract class GoogleTokenVerifier {
  abstract verify(idToken: string): Promise<GoogleIdentity>;
}

@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.env.GOOGLE_CLIENT_IDS.length === 0) {
      throw new ServiceUnavailableException('Login Google belum dikonfigurasi (GOOGLE_CLIENT_IDS kosong)');
    }
    let payload;
    try {
      // Memverifikasi signature (JWKS Google), exp, iss, dan aud.
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.env.GOOGLE_CLIENT_IDS });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token Google tidak valid');
    }
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('Token Google tidak lengkap');
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name ?? payload.email.split('@')[0],
      picture: payload.picture,
    };
  }
}
