// Shell de escritorio para observability-dashboard. No implementa lógica de
// negocio propia: sirve el build estático empaquetado (resources/dashboard/)
// por HTTP en localhost — BrowserRouter (react-router) necesita un origen
// http(s), no funciona cargado vía file:// — y el dashboard sigue hablando
// por red con el observability-service que el usuario configure en Ajustes
// (obs_url/obs_token, ya persistidos en localStorage por config-context.tsx).
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_ROOT = path.join(__dirname, 'resources', 'dashboard');
// Debe coincidir con `base` en observability-dashboard/vite.config.ts.
const BASE_PATH = '/observability/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);

      if (urlPath === '/') {
        res.writeHead(302, { Location: BASE_PATH });
        res.end();
        return;
      }
      if (!urlPath.startsWith(BASE_PATH)) {
        res.writeHead(404).end('Not found');
        return;
      }

      const relativePath = urlPath.slice(BASE_PATH.length);
      let filePath = path.join(PUBLIC_ROOT, BASE_PATH, relativePath);

      // SPA fallback: cualquier ruta de react-router sin extensión de archivo
      // (ej. /observability/traces/abc) sirve el index.html del dashboard.
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (!path.extname(relativePath)) {
          filePath = path.join(PUBLIC_ROOT, BASE_PATH, 'index.html');
        }
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404).end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function createWindow() {
  const server = await startServer();
  const { port } = server.address();

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Observability Desktop',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(`http://127.0.0.1:${port}/`);

  win.on('closed', () => server.close());
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
