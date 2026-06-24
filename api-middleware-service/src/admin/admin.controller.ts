import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { LoginDto } from './dto/login.dto';
import { SetupDto } from './dto/setup.dto';
import { AdminSessionGuard } from './guards/admin-session.guard';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('setup-required')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @ApiOperation({ summary: 'Verificar si se necesita configurar el administrador inicial' })
    @ApiResponse({ status: 200, description: 'Retorna si hace falta configurar el primer admin' })
    async setupRequired(): Promise<{ setupRequired: boolean }> {
        const setupRequired = await this.adminService.isSetupRequired();
        return { setupRequired };
    }

    @Post('setup')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear el primer administrador (solo si no existe ninguno)' })
    @ApiBody({ type: SetupDto })
    @ApiResponse({ status: 201, description: 'Administrador creado exitosamente' })
    @ApiResponse({ status: 409, description: 'Ya existe un administrador configurado' })
    async setup(@Body() dto: SetupDto): Promise<{ success: true }> {
        return this.adminService.setup(dto.username, dto.password);
    }

    @Post('login')
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Iniciar sesion como administrador' })
    @ApiBody({ type: LoginDto })
    @ApiResponse({ status: 200, description: 'Login exitoso, cookie httpOnly seteada' })
    @ApiResponse({ status: 401, description: 'Credenciales invalidas o administracion no configurada' })
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        return this.adminService.login(dto.username, dto.password, res);
    }

    @Post('logout')
    @SkipThrottle()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cerrar sesion' })
    @ApiResponse({ status: 200, description: 'Cookie de sesion eliminada' })
    logout(@Res({ passthrough: true }) res: Response) {
        return this.adminService.logout(res);
    }

    @Get('me')
    @UseGuards(AdminSessionGuard)
    @ApiOperation({ summary: 'Obtener usuario autenticado' })
    @ApiResponse({ status: 200, description: 'Usuario autenticado' })
    @ApiResponse({ status: 401, description: 'No autenticado' })
    me(@Req() req: Request) {
        return this.adminService.me((req as any).adminUser);
    }
}
