import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as https from 'https';
import * as Jwt from 'jsonwebtoken';
import { URLSearchParams } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { ServiceNowAuthError } from '../../common';

export interface ServiceNowOAuthConfig {
  oauthUrl: string;
  upn: string;
  kid: string;
  clientId: string;
  secretId: string;
  iss: string;
  grantType: string;
  authCert: string;
}

export interface ServiceNowAccessToken {
  token: string;
  exp: number;
}

export const SN_OAUTH_CONFIG = 'SN_OAUTH_CONFIG';

/**
 * Obtiene y cachea el access token OAuth2 (JWT Bearer grant) de ServiceNow.
 * La assertion se firma con el certificado privado configurado en SN_OAUTH_CERT_PATH.
 */
@Injectable()
export class ServiceNowTokenService {
  private readonly logger = new Logger(ServiceNowTokenService.name);

  private accessToken: string | null = null;
  private expiresAt = 0;
  private privateKey: string | null = null;
  private refreshPromise: Promise<ServiceNowAccessToken> | null = null;

  /** Refrescar el token este margen antes de que expire, para no llegar justo. */
  private static readonly REFRESH_MARGIN_SECONDS = 30;

  constructor(
    @Inject(SN_OAUTH_CONFIG) private readonly config: ServiceNowOAuthConfig,
  ) {}

  async getAccessToken(): Promise<ServiceNowAccessToken> {
    const now = Math.floor(Date.now() / 1000);

    if (
      this.accessToken &&
      now < this.expiresAt - ServiceNowTokenService.REFRESH_MARGIN_SECONDS
    ) {
      return { token: this.accessToken, exp: this.expiresAt };
    }

    // Varias llamadas concurrentes con el token vencido comparten el mismo
    // refresh en vuelo en vez de disparar un POST OAuth por cada una.
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchAccessToken(now).finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async fetchAccessToken(now: number): Promise<ServiceNowAccessToken> {
    const uniqueId = uuidv4();

    if (!this.privateKey) {
      this.privateKey = await fs.readFile(this.config.authCert, 'utf8');
    }

    const payload = {
      aud: this.config.clientId,
      sub: this.config.upn,
      iss: this.config.iss,
      jti: uniqueId,
      exp: now + 1, // Token válido por 60 segundos
    };

    const headers = {
      header: {
        typ: 'JWT',
        alg: 'RS256' as const,
        kid: this.config.kid,
      },
    };

    const jwtAssertion = Jwt.sign(payload, this.privateKey, headers);

    const params = new URLSearchParams({
      grant_type: this.config.grantType,
      assertion: jwtAssertion,
      client_id: this.config.clientId,
      ...(this.config.secretId ? { client_secret: this.config.secretId } : {}),
    });

    try {
      const { data } = await axios.post(
        this.config.oauthUrl,
        params.toString(),
        {
          httpAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      this.accessToken = data.access_token;
      this.expiresAt = now + (data.expires_in || 900);
      this.logger.log(
        `Access token OAuth2 obtenido de ServiceNow, expira en ${data.expires_in ?? 900}s`,
      );
      return { token: this.accessToken!, exp: this.expiresAt };
    } catch (error: any) {
      this.logger.error(
        `Error obteniendo access token OAuth2 de ServiceNow: ${error.message}`,
      );
      throw new ServiceNowAuthError(
        'No se pudo obtener el access token OAuth2 de ServiceNow',
        401,
        error.message,
      );
    }
  }
}
