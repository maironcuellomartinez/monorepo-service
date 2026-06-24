import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('external_clients')
export class ExternalClientEntity {
    @PrimaryColumn({ length: 64 })
    clientId!: string;

    /** bcrypt hash del secret — el plaintext se muestra solo al crear */
    @Column({ length: 128 })
    clientSecretHash!: string;

    @Column({ length: 100 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string | null;

    /** Duracion del access token en segundos (min: 3600 = 1h, max: 604800 = 7 dias) */
    @Column({ default: 3600 })
    tokenExpiresInSeconds!: number;

    /** Scopes permitidos para este cliente. null = sin restriccion */
    @Column({ type: 'simple-json', nullable: true })
    allowedScopes!: string[] | null;

    @Column({ default: true })
    isActive!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
