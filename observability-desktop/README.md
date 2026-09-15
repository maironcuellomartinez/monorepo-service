# Observability Desktop

Shell de escritorio (Electron) para [`observability-dashboard`](../observability-dashboard). No tiene lógica propia: empaqueta el build estático del dashboard y lo sirve localmente, y sigue hablando por red con el `observability-service` que configures en **Ajustes** dentro de la app (misma pantalla que ya existe en el dashboard web).

No modifica `observability-dashboard` ni `observability-service` — es una app aparte.

## Cómo funciona

`main.js` levanta un servidor HTTP mínimo en `127.0.0.1` (puerto aleatorio libre) que sirve el build estático bajo `/observability/` — el mismo `base` que define `observability-dashboard/vite.config.ts` — y abre la ventana apuntando ahí. Se sirve por `http://` (no `file://`) porque el dashboard usa `BrowserRouter` de react-router, que no funciona cargado directamente desde el filesystem.

## Levantar en modo desarrollo

```bash
cd observability-desktop
npm install        # instala electron + electron-builder (primera vez)
npm run dev         # compila observability-dashboard, copia su dist/ y abre la ventana
```

`npm run dev` hace todo en un paso: corre `build:dashboard` (que ejecuta `npm run build` dentro de `observability-dashboard` y copia el resultado a `resources/dashboard/`) y después abre Electron.

Una vez abierta la ventana, andá a **Ajustes** y cargá la URL y el token M2M del `observability-service` que quieras mirar (dev, staging o prod) — queda persistido en `localStorage` entre reinicios.

## Compilar instaladores

```bash
npm run build:dashboard      # una vez, genera resources/dashboard/

npx electron-builder --win    # instalador .exe (NSIS)
npx electron-builder --mac    # .dmg
npx electron-builder --linux  # .AppImage
```

O combinadas: `npx electron-builder --win --mac --linux`. Los instaladores quedan en `release/`.

### Limitación de macOS

`electron-builder` **no puede generar un `.dmg` corriendo desde Windows** — Apple requiere sus propias herramientas (`hdiutil`, etc.), que solo existen en macOS. Para compilar la versión Mac hace falta:

- Correr `npm run dist -- --mac` (o `npx electron-builder --mac`) en una máquina macOS real, o
- CI con runner macOS (ej. GitHub Actions `macos-latest`).

La build de Windows sí funciona sin problema desde cualquier SO.

### Firma de código

No hay certificado de firma configurado, así que los instaladores salen sin firmar — Windows SmartScreen y macOS Gatekeeper van a mostrar advertencia de "editor no verificado" al abrirlos. Es esperable en apps internas/dev; si en algún momento se distribuye más ampliamente, ahí conviene firmar.

## Troubleshooting: `Electron failed to install correctly`

Si `npm install` falla más tarde con este error al ejecutar `electron`, es porque la extracción del `.zip` de Electron quedó incompleta (visto en Windows, posible interferencia de antivirus). Se soluciona así:

```bash
node node_modules/electron/install.js
```

Si persiste, extraer el zip a mano:

1. Ubicar el zip cacheado en `%LOCALAPPDATA%\electron\Cache\` (buscar `electron-v*-win32-x64.zip` dentro de las subcarpetas con nombre hash).
2. Extraerlo en `node_modules/electron/dist/`.
3. Crear `node_modules/electron/path.txt` con el contenido exacto `electron.exe` (sin salto de línea final).
