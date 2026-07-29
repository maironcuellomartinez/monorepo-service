import { ProxyAgent, Dispatcher } from 'undici';

/**
 * integration-service no tiene salida directa a internet en staging/prod —
 * el egress hacia Minerva/DropPoint/Outlook pasa por Apache actuando como
 * forward proxy (ver deploy/apache-forward-proxy.conf).
 *
 * axios (droppoint.connector.ts, y el HttpClient interno de node-soap en
 * minerva-soap.client.ts) y @azure/identity (ClientSecretCredential, usado
 * por outlook-calendar.connector.ts para obtener el token) detectan
 * HTTPS_PROXY automáticamente — no necesitan wiring explícito. Verificado
 * en vivo: un axios.create() sin config de proxy y un cliente node-soap
 * default tunelean correctamente contra un forward-proxy real con solo
 * setear HTTPS_PROXY.
 *
 * El único que NO lo detecta solo es @microsoft/microsoft-graph-client
 * (usa el fetch nativo global por debajo, no axios ni node-fetch) — este
 * helper cubre ese caso puntual, vía fetchOptions.dispatcher en
 * Client.initWithMiddleware().
 *
 * ⚠️ IMPORTANTE: el fetch nativo de Node usa la copia de undici EMBEBIDA en
 * el propio binario de Node (node -e "console.log(process.versions.undici)"),
 * no la de node_modules. El paquete 'undici' instalado acá (para poder
 * importar ProxyAgent) tiene que ser la MISMA versión — si difieren, el
 * ProxyAgent construido con este paquete no es compatible con el
 * Dispatcher interno del fetch nativo y falla en silencio o con
 * "InvalidArgumentError: invalid onRequestStart method" (verificado en
 * vivo: undici@8.9.0 vs fetch nativo con undici@7.25.0 embebido → rompía;
 * pinneado a undici@7.25.0 → funciona). Si se actualiza la versión de
 * Node en este servicio, hay que re-chequear/actualizar el pin acá.
 */
export function getIntegrationProxyDispatcher(): Dispatcher | undefined {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (!proxyUrl) return undefined;
    return new ProxyAgent(proxyUrl);
}
