import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { ClientsService } from '../clients/clients.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

const REFRESH_TOKEN_EXPIRATION_SECONDS = 7 * 24 * 3600;
const MIN_TOKEN_EXPIRATION = 3600;
const MAX_TOKEN_EXPIRATION = 7 * 24 * 3600;

@Injectable()
export class AuthService {
    constructor(
        private readonly clients: ClientsService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
        private readonly dataSource: DataSource,
        @InjectRepository(RefreshTokenEntity)
        private readonly refreshRepo: Repository<RefreshTokenEntity>,
    ) { }

    async issueToken(
        clientId: string,
        clientSecret: string,
        dto: TokenRequestDto,
    ): Promise<TokenResponseDto> {
        const client = await this.clients.validateCredentials(clientId, clientSecret);
        if (!client) throw new UnauthorizedException('Credenciales invalidas');

        const clientExpiresIn = client.tokenExpiresInSeconds ?? 3600;
        const expiresIn = Math.min(
            Math.max(clientExpiresIn, MIN_TOKEN_EXPIRATION),
            MAX_TOKEN_EXPIRATION,
        );

        const requestedScopes = dto.scope
            ? dto.scope.split(' ').filter(Boolean)
            : [];

        let grantedScopes: string[] | undefined;
        if (requestedScopes.length > 0) {
            grantedScopes = client.allowedScopes
                ? requestedScopes.filter(s => client.allowedScopes!.includes(s))
                : requestedScopes;
            if (grantedScopes.length === 0) {
                throw new BadRequestException({
                    error: 'invalid_scope',
                    error_description: 'Ninguno de los scopes solicitados es valido para este cliente',
                });
            }
        } else if (client.allowedScopes && client.allowedScopes.length > 0) {
            grantedScopes = client.allowedScopes;
        }

        const payload: Record<string, any> = {
            jti: crypto.randomUUID(),
            sub: client.clientId,
            type: 'external_client',
            clientName: client.name,
        };
        if (grantedScopes) payload.scope = grantedScopes;

        const access_token = this.jwt.sign(payload, { expiresIn });
        const refresh_token = await this.issueRefreshToken(client.clientId, grantedScopes);

        return {
            access_token,
            refresh_token,
            token_type: 'Bearer',
            expires_in: expiresIn,
            client_name: client.name,
            ...(grantedScopes ? { scope: grantedScopes } : {}),
        };
    }

    async refreshToken(dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
        let payload: any;
        try {
            payload = this.jwt.verify(dto.refresh_token);
        } catch {
            throw new UnauthorizedException('Refresh token invalido o expirado');
        }

        if (payload.type !== 'refresh_token' || !payload.sub || !payload.jti) {
            throw new UnauthorizedException('Refresh token malformado');
        }

        const clientId = payload.sub;
        const jti = payload.jti;
        const jtiHash = crypto.createHash('sha256').update(jti).digest('hex');

        // Buscar sin filtrar por revokedAt para detectar reuse attacks
        const storedToken = await this.refreshRepo.findOne({
            where: { clientId, jtiHash },
        });

        if (!storedToken) {
            throw new UnauthorizedException('Refresh token no encontrado');
        }

        if (storedToken.revokedAt !== null) {
            // Token ya fue usado — posible reuse attack. Solo revocar si aún hay tokens activos
            // para evitar que un cascade previo dispare revokeAll repetidas veces en vano.
            await this.revokeAllClientTokens(clientId);
            throw new UnauthorizedException('Refresh token ya fue utilizado');
        }

        if (storedToken.expiresAt < new Date()) {
            throw new UnauthorizedException('Refresh token expirado');
        }

        const client = await this.clients.findOne(clientId);
        if (!client.isActive) {
            throw new UnauthorizedException('El cliente esta desactivado');
        }
        const clientExpiresIn = client.tokenExpiresInSeconds ?? 3600;
        const expiresIn = Math.min(
            Math.max(clientExpiresIn, MIN_TOKEN_EXPIRATION),
            MAX_TOKEN_EXPIRATION,
        );

        // Recuperar scopes otorgados originalmente
        const grantedScopes = storedToken.grantedScopes ?? undefined;

        const accessPayload: Record<string, any> = {
            jti: crypto.randomUUID(),
            sub: client.clientId,
            type: 'external_client',
            clientName: client.name,
        };
        if (grantedScopes) accessPayload.scope = grantedScopes;

        // Rotar dentro de transacción: si la emisión del nuevo token falla, el viejo no queda revocado
        let newRefreshJwt!: string;
        await this.dataSource.transaction(async manager => {
            storedToken.revokedAt = new Date();
            await manager.save(storedToken);

            const { entity, jwt: refreshJwt } = this.buildRefreshTokenEntity(clientId, grantedScopes);
            await manager.save(entity);
            newRefreshJwt = refreshJwt;
        });

        const access_token = this.jwt.sign(accessPayload, { expiresIn });

        return {
            access_token,
            refresh_token: newRefreshJwt,
            token_type: 'Bearer',
            expires_in: expiresIn,
            client_name: client.name,
        };
    }

    private async issueRefreshToken(clientId: string, grantedScopes?: string[]): Promise<string> {
        const { entity, jwt } = this.buildRefreshTokenEntity(clientId, grantedScopes);
        await this.refreshRepo.save(entity);
        return jwt;
    }

    private buildRefreshTokenEntity(
        clientId: string,
        grantedScopes?: string[],
    ): { entity: RefreshTokenEntity; jwt: string } {
        const jti = crypto.randomUUID();
        const jtiHash = crypto.createHash('sha256').update(jti).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_SECONDS * 1000);

        const entity = this.refreshRepo.create({
            clientId,
            tokenHash: jtiHash, // SHA-256 es suficiente; bcrypt era overkill sobre UUID
            jtiHash,
            expiresAt,
            grantedScopes: grantedScopes ?? null,
        });

        const jwt = this.jwt.sign(
            { sub: clientId, type: 'refresh_token', jti },
            { expiresIn: REFRESH_TOKEN_EXPIRATION_SECONDS },
        );

        return { entity, jwt };
    }

    private async revokeAllClientTokens(clientId: string): Promise<void> {
        await this.refreshRepo.update(
            { clientId, revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
    }
}
