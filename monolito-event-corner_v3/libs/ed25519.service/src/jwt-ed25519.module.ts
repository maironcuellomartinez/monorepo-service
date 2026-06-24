import { Module, DynamicModule, Provider } from '@nestjs/common';
import { JwtEd25519Service } from './jwt-ed25519.service';
import { JwtEd25519ModuleOptions } from './jwt-ed25519.interfaces';
import { JWT_ED25519_OPTIONS } from './jwt-ed25519.constants';

@Module({})
export class JwtEd25519Module {
    static forRoot(options: JwtEd25519ModuleOptions): DynamicModule {
        return {
            module: JwtEd25519Module,
            providers: [
                {
                    provide: JWT_ED25519_OPTIONS,
                    useValue: options,
                },
                JwtEd25519Service,
            ],
            exports: [JwtEd25519Service],
        };
    }

    static forRootAsync(asyncOptions: {
        imports?: any[];
        useFactory: (...args: any[]) => Promise<JwtEd25519ModuleOptions> | JwtEd25519ModuleOptions;
        inject?: any[];
    }): DynamicModule {
        const providers: Provider[] = [
            {
                provide: JWT_ED25519_OPTIONS,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject || [],
            },
            JwtEd25519Service,
        ];
        return {
            module: JwtEd25519Module,
            imports: asyncOptions.imports || [],
            providers,
            exports: [JwtEd25519Service],
        };
    }
}