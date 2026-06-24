import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { AdminEntity } from './entities/admin.entity';

const COOKIE_NAME = 'admin_session';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(AdminEntity)
        private readonly adminRepo: Repository<AdminEntity>,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) {}

    /**
     * Retorna true si no existe ningun administrador en la base de datos.
     */
    async isSetupRequired(): Promise<boolean> {
        const count = await this.adminRepo.count();
        return count === 0;
    }

    /**
     * Crea el primer administrador en la base de datos.
     * Solo funciona si no existe ningun admin registrado.
     * @throws ConflictException si ya existe al menos un admin.
     */
    async setup(username: string, password: string): Promise<{ success: true }> {
        const setupRequired = await this.isSetupRequired();
        if (!setupRequired) {
            throw new ConflictException('Ya existe un administrador configurado');
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        await this.adminRepo.save({ username, passwordHash });

        return { success: true };
    }

    /**
     * Valida credenciales contra la base de datos y setea cookie httpOnly con JWT.
     * @throws UnauthorizedException si no hay admins configurados o las credenciales no coinciden.
     */
    async login(username: string, password: string, res: Response): Promise<{ success: true }> {
        const setupRequired = await this.isSetupRequired();
        if (setupRequired) {
            throw new UnauthorizedException(
                'Administracion no configurada. Use POST /admin/setup para crear el primer administrador.',
            );
        }

        const admin = await this.adminRepo.findOne({ where: { username } });
        if (!admin) {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        const passwordValid = await bcrypt.compare(password, admin.passwordHash);
        if (!passwordValid) {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        const token = this.jwtService.sign({ username }, { expiresIn: '24h' });

        const isSecure = this.config.get('app.env') !== 'development';
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'strict',
            path: '/',
            secure: isSecure,
            maxAge: COOKIE_MAX_AGE_MS,
        });

        return { success: true };
    }

    /**
     * Limpia la cookie de sesion.
     */
    logout(res: Response): { success: true } {
        res.clearCookie(COOKIE_NAME, { path: '/' });
        return { success: true };
    }

    /**
     * Retorna el usuario autenticado desde el payload del token.
     */
    me(adminUser: { username: string }): { username: string } {
        return { username: adminUser.username };
    }
}
