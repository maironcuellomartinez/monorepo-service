/**
 * Cachea en memoria los `applicationId` de aplicaciones desactivadas en
 * ABAC (`GET /auth/revoked-applications`) y los refresca por intervalo.
 *
 * La verificación M2M es local (firma Ed25519, sin llamada de red) por
 * diseño — rápida y resiliente incluso si ABAC está caído — así que un
 * token M2M de 180+ días no tenía forma de invalidarse antes de que
 * expirara, salvo rotar la clave Ed25519 del ecosistema entero, lo que
 * corta el M2M de TODOS los servicios a la vez (ver A-07 en la auditoría
 * de 2026-08-31).
 *
 * Este poller cierra esa brecha sin tocar el modelo de verificación local:
 * desactivar la Application en ABAC la agrega a esta lista, y cada
 * verificador la empieza a rechazar dentro del próximo intervalo — sin
 * rotar claves ni reiniciar servicios. Si ABAC no responde, se mantiene la
 * última lista conocida (fail-open en disponibilidad, nunca en seguridad:
 * nunca se "olvida" una revocación ya vista por no poder refrescar).
 */
export class RevokedApplicationsPoller {
    private revoked = new Set<string>();
    private timer?: ReturnType<typeof setInterval>;

    constructor(
        private readonly abacUrl: string,
        private readonly intervalMs: number = 30_000,
    ) {}

    start(): void {
        this.refresh();
        this.timer = setInterval(() => this.refresh(), this.intervalMs);
        this.timer.unref?.();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
    }

    isRevoked(applicationId: string | undefined | null): boolean {
        return !!applicationId && this.revoked.has(applicationId);
    }

    private async refresh(): Promise<void> {
        try {
            const res = await fetch(`${this.abacUrl}/auth/revoked-applications`, {
                signal: AbortSignal.timeout(5_000),
            });
            if (!res.ok) return;
            const body = (await res.json()) as { applicationIds?: string[] };
            this.revoked = new Set(body.applicationIds ?? []);
        } catch {
            // ABAC no disponible — se mantiene la última lista conocida.
        }
    }
}
