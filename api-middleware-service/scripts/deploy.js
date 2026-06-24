#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_ENVS = ['staging', 'production'];
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, '..');

function step(msg) {
    console.log(`\n[${new Date().toLocaleTimeString()}] ${msg}`);
}

function ok(msg) {
    console.log(`  OK: ${msg}`);
}

function askInteractive(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function resolveEnv() {
    // Argumento CLI: node deploy.js staging
    const arg = process.argv[2];
    if (arg) {
        if (!VALID_ENVS.includes(arg)) {
            console.error(`Entorno invalido: "${arg}". Opciones: ${VALID_ENVS.join(', ')}`);
            process.exit(1);
        }
        return arg;
    }

    // Interactivo
    let env = '';
    while (!VALID_ENVS.includes(env)) {
        env = await askInteractive(`Entorno [${VALID_ENVS.join(' / ')}]: `);
        if (!VALID_ENVS.includes(env)) {
            console.log(`  Invalido. Opciones: ${VALID_ENVS.join(', ')}`);
        }
    }
    return env;
}

async function main() {
    console.log('');
    console.log('================================================');
    console.log('  api-middleware-service — Deploy Packager');
    console.log('================================================\n');

    const env = await resolveEnv();

    // Verificar que existe el .env del entorno
    const envFile = `.env.${env}`;
    const envFilePath = path.join(PROJECT_ROOT, envFile);
    if (!fs.existsSync(envFilePath)) {
        console.error(`Error: no se encontro ${envFile} en el proyecto.`);
        process.exit(1);
    }

    // Directorio de salida: ../api-middleware-deploy-<env>-<fecha>
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const outputDirName = `api-middleware-deploy-${env}-${date}`;
    const outputDir = path.join(WORKSPACE_ROOT, outputDirName);
    const zipPath = path.join(WORKSPACE_ROOT, `${outputDirName}.zip`);

    console.log(`Entorno:  ${env}`);
    console.log(`Destino:  ${outputDir}`);
    console.log(`ZIP:      ${zipPath}`);

    // Confirmacion solo en modo interactivo
    if (!process.argv[2]) {
        const confirm = await askInteractive('\nConfirmar? [s/n]: ');
        if (confirm !== 's') {
            console.log('\nCancelado.');
            process.exit(0);
        }
    }

    // Limpiar destino si ya existe
    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    // 1. Build
    step('Compilando el proyecto (npm run build)...');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    ok('Build completado');

    // 2. Copiar archivos necesarios
    step('Copiando archivos...');

    fs.cpSync(path.join(PROJECT_ROOT, 'dist'), path.join(outputDir, 'dist'), { recursive: true });
    ok('dist/');

    fs.copyFileSync(path.join(PROJECT_ROOT, 'package.json'), path.join(outputDir, 'package.json'));
    ok('package.json');

    const lockFile = path.join(PROJECT_ROOT, 'package-lock.json');
    if (fs.existsSync(lockFile)) {
        fs.copyFileSync(lockFile, path.join(outputDir, 'package-lock.json'));
        ok('package-lock.json');
    }

    fs.copyFileSync(path.join(PROJECT_ROOT, 'ecosystem.config.js'), path.join(outputDir, 'ecosystem.config.js'));
    ok('ecosystem.config.js');

    fs.copyFileSync(envFilePath, path.join(outputDir, envFile));
    ok(envFile);

    // 3. Instalar solo dependencias de produccion
    step('Instalando dependencias de produccion (npm install --omit=dev)...');
    execSync('npm install --omit=dev', { cwd: outputDir, stdio: 'inherit' });
    ok('node_modules instalado');

    // 4. Ejecutar migraciones pendientes
    step('Ejecutando migraciones (migration:run:dist)...');
    execSync('npm run migration:run:dist', { cwd: outputDir, stdio: 'inherit', env: { ...process.env, NODE_ENV: env } });
    ok('Migraciones aplicadas');

    // 6. Crear ZIP
    step(`Creando ${outputDirName}.zip...`);
    if (os.platform() === 'win32') {
        execSync(
            `powershell -Command "Compress-Archive -Path '${outputDir}' -DestinationPath '${zipPath}' -Force"`,
            { stdio: 'inherit' }
        );
    } else {
        execSync(`zip -r "${zipPath}" "${outputDirName}"`, { cwd: WORKSPACE_ROOT, stdio: 'inherit' });
    }
    ok(`${outputDirName}.zip`);

    // Resumen
    console.log('');
    console.log('================================================');
    console.log('  Paquete generado exitosamente');
    console.log('================================================');
    console.log(`  Carpeta : ${outputDir}`);
    console.log(`  ZIP     : ${zipPath}`);
    console.log('');
    console.log('Para iniciar en el servidor:');
    console.log('  npm run migration:run   # solo si hay migraciones pendientes');
    console.log(`  pm2 start ecosystem.config.js --env ${env}`);
    console.log('  pm2 save');
    console.log('');
}

main().catch(err => {
    console.error('\nError:', err.message);
    process.exit(1);
});
