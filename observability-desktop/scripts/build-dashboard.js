// Compila observability-dashboard (sin tocar su código) y copia su dist/
// dentro de resources/dashboard/observability/ — mismo sub-path ('/observability/')
// que vite.config.ts define como `base`, para que los assets resuelvan igual
// que en el deploy real detrás de Apache.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dashboardDir = path.resolve(__dirname, '..', '..', 'observability-dashboard');
const dashboardDist = path.join(dashboardDir, 'dist');
const resourcesDir = path.resolve(__dirname, '..', 'resources', 'dashboard');
const targetDir = path.join(resourcesDir, 'observability');

console.log('[observability-desktop] Compilando observability-dashboard (npm run build)...');
execSync('npm run build', { cwd: dashboardDir, stdio: 'inherit' });

if (!fs.existsSync(dashboardDist)) {
  throw new Error(`No se encontró ${dashboardDist} tras el build.`);
}

console.log('[observability-desktop] Copiando dist/ -> resources/dashboard/observability/...');
fs.rmSync(resourcesDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(dashboardDist, targetDir, { recursive: true });

console.log('[observability-desktop] Listo.');
