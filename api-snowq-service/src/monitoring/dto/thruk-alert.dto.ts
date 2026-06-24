import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Tipos de notificación de Nagios que Thruk reenvía.
 *
 * Solo PROBLEM y RECOVERY generan acciones en api-snowq-service.
 * El resto se ignora con log informativo.
 */
export enum NagiosNotificationType {
    PROBLEM = 'PROBLEM',
    RECOVERY = 'RECOVERY',
    ACKNOWLEDGEMENT = 'ACKNOWLEDGEMENT',
    FLAPPINGSTART = 'FLAPPINGSTART',
    FLAPPINGSTOP = 'FLAPPINGSTOP',
    DOWNTIMESTART = 'DOWNTIMESTART',
    DOWNTIMEEND = 'DOWNTIMEEND',
}

/**
 * Estado del check en Nagios.
 * SOFT: el servicio falló pero todavía está en el período de re-chequeo.
 * HARD: la falla fue confirmada (se agotaron los re-chequeos).
 *
 * Solo los estados HARD generan tickets en SN — los SOFT son transitorios.
 */
export enum NagiosStateType {
    SOFT = 'SOFT',
    HARD = 'HARD',
}

/**
 * DTO que Thruk envía a POST /monitoring/alerts.
 *
 * Thruk construye este payload desde los macros de Nagios:
 *   notificationType  ← $NOTIFICATIONTYPE$
 *   host              ← $HOSTNAME$
 *   service           ← $SERVICEDESC$    (vacío en alertas de host)
 *   state             ← $SERVICESTATE$   o $HOSTSTATE$
 *   stateType         ← $SERVICESTATETYPE$
 *   checkAttempt      ← $SERVICEATTEMPT$
 *   maxCheckAttempts  ← $MAXSERVICECHECKATTEMPTS$
 *   output            ← $SERVICEOUTPUT$  o $HOSTOUTPUT$
 */
export class ThrukAlertDto {
    @IsEnum(NagiosNotificationType)
    notificationType: NagiosNotificationType;

    @IsString()
    @IsNotEmpty()
    host: string;

    @IsOptional()
    @IsString()
    service?: string;

    @IsString()
    @IsNotEmpty()
    state: string; // DOWN / UP / CRITICAL / OK / WARNING / UNKNOWN

    @IsEnum(NagiosStateType)
    stateType: NagiosStateType;

    @IsInt()
    @Min(1)
    checkAttempt: number;

    @IsInt()
    @Min(1)
    maxCheckAttempts: number;

    @IsString()
    output: string; // salida del plugin — se usa como descripción en SN

    /**
     * TTL en segundos desde la creación.
     * Si el registro sigue QUEUED cuando vence, se descarta como EXPIRED.
     * Recomendado: menor que el intervalo de re-notificación de Nagios.
     * Default si no se envía: sin expiración (el sistema lo procesa siempre).
     */
    @IsOptional()
    @IsInt()
    @Min(30)
    ttlSeconds?: number;
}
