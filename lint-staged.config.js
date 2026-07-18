// lint-staged.config.js — corre el eslint propio de cada servicio sobre los
// archivos staged. Cada servicio tiene su propia versión de eslint, plugins y
// config (flat config, eslint.config.mjs) en su propio node_modules, por eso
// no se puede correr un único `eslint` desde la raíz: hay que invocar el
// binario local de cada servicio con su cwd correspondiente.
//
// Servicios sin eslint configurado (event-corner-app no tiene eslint como
// devDependency; observability-service, minerva-app y observability-dashboard
// tienen script "lint" pero no encontré eslint.config.* / .eslintrc.*) quedan
// fuera de este archivo — no hay nada que correr ahí todavía.
//
// Servicios con eslint.config.* roto (verificado con `npx eslint --print-config`,
// falla independientemente de Husky) — comentados hasta que se arreglen ahí:
//   - abac-microservice:      falta eslint-plugin-prettier en devDependencies/node_modules
//   - api-snowq-dashboard:    eslint.config.mjs tiene un SyntaxError (token ':' inesperado)
//   - auth-configuration-app: "tseslint.configs is not a function" (versión de typescript-eslint desalineada)
const path = require('path')

function inService(serviceDir) {
  const abs = path.join(__dirname, serviceDir).replace(/\\/g, '/')
  return (files) => {
    const quoted = files.map((f) => `'${f.replace(/\\/g, '/')}'`).join(' ')
    return `bash -c "cd '${abs}' && npx eslint --fix ${quoted}"`
  }
}

module.exports = {
  'monolito-event-corner_v3/**/*.ts': inService('monolito-event-corner_v3'),
  'integration-service/**/*.ts': inService('integration-service'),
  'api-snowq-service/**/*.ts': inService('api-snowq-service'),
  'servicenow-clone-backend/**/*.ts': inService('servicenow-clone-backend'),
  // 'abac-microservice/**/*.ts': inService('abac-microservice'),
  // 'api-snowq-dashboard/**/*.{js,jsx,ts,tsx}': inService('api-snowq-dashboard'),
  // 'auth-configuration-app/**/*.{js,jsx,ts,tsx}': inService('auth-configuration-app'),
}
