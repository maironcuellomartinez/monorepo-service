import { motion, type Variants } from 'framer-motion';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// ── Variants compartidos ──────────────────────────────────────────

const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

// Variant combinada para MotionCard: fadeSlideUp + hover scale
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
  hover: {
    scale: 1.02,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
};

// ── MotionDiv ─────────────────────────────────────────────────────

interface MotionDivProps extends HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article';
  delay?: number;
}

export function MotionDiv({
  as = 'div',
  delay = 0,
  className,
  children,
  ...props
}: MotionDivProps) {
  const MotionTag = motion[as as keyof typeof motion] as React.ElementType;

  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeSlideUp}
      custom={delay}
      className={cn(className)}
      {...props}
    >
      {children}
    </MotionTag>
  );
}

// ── MotionStagger ─────────────────────────────────────────────────

interface MotionStaggerProps extends HTMLAttributes<HTMLUListElement> {
  as?: 'ul' | 'ol';
}

export function MotionStagger({
  as = 'ul',
  className,
  children,
  ...props
}: MotionStaggerProps) {
  const Tag = as;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={staggerContainer}
    >
      <Tag className={cn(className)} {...props}>
        {children}
      </Tag>
    </motion.div>
  );
}

export function MotionStaggerItem({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return (
    <motion.li variants={staggerItem} className={cn(className)} {...props}>
      {children}
    </motion.li>
  );
}

// ── MotionCard ────────────────────────────────────────────────────
// Un solo motion.div con variants combinadas (fadeSlideUp + hover scale)

interface MotionCardProps {
  className?: string;
  children?: ReactNode;
}

export function MotionCard({ className, children }: MotionCardProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      whileHover="hover"
      viewport={{ once: true, margin: '-40px' }}
      variants={cardVariants}
    >
      <Card className={cn(className)}>{children}</Card>
    </motion.div>
  );
}

// ── MotionBadge ───────────────────────────────────────────────────

interface MotionBadgeProps {
  className?: string;
  children?: ReactNode;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export function MotionBadge({
  className,
  children,
  variant,
}: MotionBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="inline-block"
    >
      <Badge variant={variant} className={cn(className)}>
        {children}
      </Badge>
    </motion.div>
  );
}

// ── MotionHeader ──────────────────────────────────────────────────
// Envuelve el heading real (h1..h4) en un motion.div con fadeSlideUp

interface MotionHeaderProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export function MotionHeader({
  as = 'h2',
  className,
  children,
  ...props
}: MotionHeaderProps) {
  const HeadingTag = as;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeSlideUp}
    >
      <HeadingTag className={cn(className)} {...props}>
        {children}
      </HeadingTag>
    </motion.div>
  );
}

// ── MotionInlineCode ──────────────────────────────────────────────

export const MotionInlineCode = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => (
  <motion.code
    ref={ref}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.3 }}
    className={cn(
      'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
      className
    )}
    {...props}
  >
    {children}
  </motion.code>
));
MotionInlineCode.displayName = 'MotionInlineCode';

// ── MotionTable ───────────────────────────────────────────────────

export function MotionTable({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeSlideUp}
      className="my-6 w-full overflow-y-auto"
    >
      <table
        className={cn('w-full border-collapse', className)}
        {...props}
      >
        {children}
      </table>
    </motion.div>
  );
}

// ── MotionPre (code block) ────────────────────────────────────────
// Card + CardContent envueltos dentro del motion.div

export function MotionPre({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeSlideUp}
    >
      <Card className={cn('my-6 overflow-hidden', className)} {...props}>
        <CardContent className="p-0">
          <pre className="overflow-x-auto p-4 text-sm">{children}</pre>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── FlowStep ──────────────────────────────────────────────────────
// Paso animado individual con numero en circulo

interface FlowStepProps {
  step: number;
  children: ReactNode;
  delay?: number;
}

export function FlowStep({ step, children, delay = 0 }: FlowStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      className="flex items-start gap-3"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {step}
      </span>
      <p className="pt-1 text-sm text-foreground/80">{children}</p>
    </motion.div>
  );
}

// ── FlowList ──────────────────────────────────────────────────────
// Contenedor con stagger para FlowSteps

interface FlowListProps {
  children: ReactNode;
  className?: string;
}

export function FlowList({ children, className }: FlowListProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.12, delayChildren: 0.1 },
        },
      }}
      className={cn('space-y-3', className)}
    >
      {children}
    </motion.div>
  );
}

// ── RefreshTokenFlow ──────────────────────────────────────────────
// Flujo especifico de refresh token con outcomes

export function RefreshTokenFlow() {
  return (
    <FlowList>
      <FlowStep step={1} delay={0}>
        Verificar firma JWT del refresh token
      </FlowStep>
      <FlowStep step={2} delay={0.12}>
        Buscar en BD por hash del jti
      </FlowStep>
      <FlowStep step={3} delay={0.24}>
        Comparar hash con bcrypt
      </FlowStep>

      {/* Outcomes con stagger */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15, delayChildren: 0.4 },
          },
        }}
        className="ml-11 mt-4 space-y-2"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, x: -10 },
            visible: { opacity: 1, x: 0 },
          }}
          className="flex items-center gap-2"
        >
          <Badge variant="default">Si coincide</Badge>
          <span className="text-sm text-foreground/80">
            → Emitir nuevos tokens
          </span>
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, x: -10 },
            visible: { opacity: 1, x: 0 },
          }}
          className="flex items-center gap-2"
        >
          <Badge variant="destructive">Si NO coincide</Badge>
          <span className="text-sm text-foreground/80">
            → REUSE ATTACK - Revocar TODOS
          </span>
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, x: -10 },
            visible: { opacity: 1, x: 0 },
          }}
          className="flex items-center gap-2"
        >
          <Badge variant="secondary">Si expirado</Badge>
          <span className="text-sm text-foreground/80">
            → 401 Unauthorized
          </span>
        </motion.div>
      </motion.div>
    </FlowList>
  );
}

// ── ArchitectureFlow ──────────────────────────────────────────────
// 3 cards animadas conectoras

export function ArchitectureFlow() {
  const steps = [
    {
      num: 1,
      title: 'Registro',
      badge: 'POST /clients',
      desc: 'Registra un nuevo cliente con duracion de token configurable y obtiene un clientId con prefijo mc_',
    },
    {
      num: 2,
      title: 'Autenticacion',
      badge: 'POST /oauth/token',
      desc: 'Intercambia client_credentials por un access token JWT con expiracion por cliente',
    },
    {
      num: 3,
      title: 'Acceso a datos',
      badge: 'GET /v1/requests/*',
      desc: 'Consume recursos protegidos enviando el Bearer token en el header Authorization',
    },
  ];

  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <motion.div
          key={s.num}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.15 }}
          className="flex items-start gap-4"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {s.num}
          </span>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {s.title}
              </span>
              <Badge variant="outline" className="font-mono text-xs">
                {s.badge}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{s.desc}</p>
          </div>
          {i < steps.length - 1 && (
            <svg
              className="hidden h-8 w-6 shrink-0 text-muted-foreground/40 md:block"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ── BulkheadFlow ──────────────────────────────────────────────────
// 3 capas de resiliencia con linea vertical conectora

export function BulkheadFlow() {
  const layers = [
    {
      num: 1,
      level: 'Capa 1',
      title: 'HTTP Bulkhead entrante',
      desc: 'Middleware global que limita conexiones concurrentes entrantes. Rechaza con 503 si el servidor esta saturado.',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    {
      num: 2,
      level: 'Capa 2',
      title: 'OAuth Bulkhead',
      desc: 'Guard especifico para bcrypt. Limita la cantidad de verificaciones de hash simultaneas para evitar CPU exhaustion.',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      num: 3,
      level: 'Capa 3',
      title: 'Gateway saliente',
      desc: 'Cola de peticiones (p-queue) + circuit breaker hacia api-gateway. Aisla fallos externos del resto del sistema.',
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <div className="relative">
      {/* Linea vertical conectora (hidden en mobile) */}
      <div className="absolute left-5 top-0 hidden h-full w-0.5 bg-border md:block" />

      <div className="space-y-6">
        {layers.map((l, i) => (
          <motion.div
            key={l.num}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{
              duration: 0.5,
              ease: 'easeOut',
              delay: i * 0.2,
            }}
            className="relative flex items-start gap-4 pl-0 md:pl-12"
          >
            {/* Circulo numerado con spring scale */}
            <motion.span
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 20,
                delay: i * 0.2 + 0.1,
              }}
              className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${l.color}`}
            >
              {l.num}
            </motion.span>

            <Card className="flex-1">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {l.level}
                  </Badge>
                  <CardTitle className="text-base">{l.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {l.desc}
                </CardDescription>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── MotionBlockquote ──────────────────────────────────────────────

export function MotionBlockquote({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLQuoteElement>) {
  return (
    <motion.blockquote
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeSlideUp}
      className={cn('mt-6 border-l-2 pl-6 italic', className)}
      {...props}
    >
      {children}
    </motion.blockquote>
  );
}
