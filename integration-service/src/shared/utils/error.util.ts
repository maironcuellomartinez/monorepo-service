/**
 * Describe un error de forma legible incluso cuando su `.message` viene vacío
 * (caso típico de `AggregateError`: Node lo lanza sin message top-level cuando
 * falla la conexión por IPv4 y IPv6 a la vez — ej. axios/follow-redirects
 * contra `localhost` con el servicio destino caído). El detalle real vive en
 * `.errors`, un array de sub-errores con su propio `code`/`message`.
 */
export function describeError(error: unknown): string {
  const err = error as
    | { errors?: unknown[]; code?: string; message?: string; name?: string }
    | null
    | undefined;

  if (Array.isArray(err?.errors) && err.errors.length > 0) {
    const detail = err.errors
      .map(
        (e) =>
          (e as { code?: string; message?: string })?.code ||
          (e as { code?: string; message?: string })?.message,
      )
      .filter(Boolean)
      .join(', ');
    if (detail) return detail;
  }

  return err?.code || err?.message || err?.name || 'Unknown error';
}
