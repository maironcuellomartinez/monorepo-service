export const levelColors: Record<string, string> = {
  HTTP: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  Aplicacion: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  Datos: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  Autenticacion: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  Sesion: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  Configuracion: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  Input: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Base de datos': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
};

export interface Medida {
  medida: string;
  implementacion: string;
  nivel: string;
}

export const medidas: Medida[] = [
  { medida: 'Helmet', implementacion: 'app.use(helmet())', nivel: 'HTTP' },
  { medida: 'Compression', implementacion: 'app.use(compression())', nivel: 'HTTP' },
  { medida: 'CORS restringido', implementacion: 'Origenes explicitos por entorno', nivel: 'HTTP' },
  { medida: 'Rate limiting', implementacion: '@nestjs/throttler (100 req/min global)', nivel: 'HTTP' },
  { medida: 'Bulkhead 3 capas', implementacion: 'Middleware + Guard + PQueue', nivel: 'Aplicacion' },
  { medida: 'bcrypt para secrets', implementacion: 'Hash + salt (10 rounds)', nivel: 'Datos' },
  { medida: 'JWT firmado', implementacion: 'HMAC con JWT_SECRET', nivel: 'Autenticacion' },
  { medida: 'Refresh token rotation', implementacion: 'Revocacion + re-emision', nivel: 'Autenticacion' },
  { medida: 'Reuse attack detection', implementacion: 'Revocacion total ante reuse', nivel: 'Autenticacion' },
  { medida: 'Cookie httpOnly', implementacion: 'Sesion admin con secure + sameSite strict', nivel: 'Sesion' },
  { medida: 'Validacion de entorno', implementacion: 'requiredSecret() en staging/production', nivel: 'Configuracion' },
  { medida: 'Whitelist de DTOs', implementacion: 'ValidationPipe con forbidNonWhitelisted', nivel: 'Input' },
  { medida: 'TypeORM synchronize', implementacion: 'Solo en development', nivel: 'Base de datos' },
];

// Variantes de animacion para framer-motion (usadas en MDX)
export const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export const codeVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
};
