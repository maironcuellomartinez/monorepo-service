import { HttpsProxyAgent, HttpsProxyAgentOptions } from 'https-proxy-agent';

/**
 * En staging/prod, api-snowq-service no tiene salida directa a internet —
 * el egress hacia el ServiceNow real pasa por Apache actuando como forward
 * proxy (ver deploy/apache-forward-proxy.conf). En dev, SN_PROXY_URL queda
 * sin definir y las llamadas van directas al simulador local.
 *
 * `options` se reenvía al constructor del agente (ej: rejectUnauthorized)
 * para no perder configuración de TLS existente al agregar el proxy.
 */
export function getSnProxyAgent(
    options?: HttpsProxyAgentOptions<string>,
): HttpsProxyAgent<string> | undefined {
    const proxyUrl = process.env.SN_PROXY_URL;
    if (!proxyUrl) return undefined;
    return new HttpsProxyAgent(proxyUrl, options);
}
