import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index()
    @Column({ length: 64 })
    clientId!: string;

    /** bcrypt hash del jti — verificacion de autenticidad */
    @Column({ length: 128 })
    tokenHash!: string;

    /** SHA-256 del jti — lookup exacto sin ambiguedad por orden */
    @Index('IDX_refresh_tokens_jtiHash')
    @Column({ type: 'varchar', length: 64, nullable: true })
    jtiHash!: string | null;

    /** Scopes otorgados en la emisión original, preservados en rotaciones */
    @Column({ type: 'simple-json', nullable: true })
    grantedScopes!: string[] | null;

    @Column({ type: 'datetime' })
    expiresAt!: Date;

    @Column({ type: 'datetime', nullable: true })
    revokedAt!: Date | null;

    @CreateDateColumn()
    createdAt!: Date;
}
