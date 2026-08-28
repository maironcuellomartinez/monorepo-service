import { Result } from "@app/result";

export class ServiceNowCategory {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }
    toJSON() { return this._value; }

    static create(value: string): Result<ServiceNowCategory> {
        if (!value || value.trim().length === 0) {
            return Result.err(new Error('ServiceNow category cannot be empty'));
        }

        return Result.ok(new ServiceNowCategory(value.trim()));
    }
}

/**
 * sys_id de ServiceNow: 32 caracteres hexadecimales.
 */
const SYS_ID_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Extrae un sys_id de catalog item del valor de `servicenowCategory` para
 * categorías REQUEST-* (ej. Onboarding/Decomisión). El formato exacto visto
 * en el panel admin real de producción es una celda multilínea con "request"
 * y el sys_id — el delimitador exacto (salto de línea, coma, "/") no está
 * confirmado contra un valor crudo de base de datos, así que este parser no
 * asume ninguno: separa por cualquier corrida de caracteres no
 * alfanuméricos y devuelve el primer token con forma de sys_id.
 *
 * Si no se encuentra ningún token válido, devuelve `null` (no lanza) — el
 * caller debe loguear y continuar sin `cat_item`, igual que el comportamiento
 * actual antes de este wiring.
 */
export function parseCatalogItemSysId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const tokens = raw.split(/[^0-9a-zA-Z]+/);
    const sysId = tokens.find((t) => SYS_ID_PATTERN.test(t));
    return sysId ?? null;
}
