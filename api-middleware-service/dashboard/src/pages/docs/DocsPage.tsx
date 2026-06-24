import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { useMdxComponents } from '@/components/docs/MdxComponents';

const mdxModules: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  index: lazy(() => import('@docs/index.mdx')),
  arquitectura: lazy(() => import('@docs/arquitectura.mdx')),
  resiliencia: lazy(() => import('@docs/resiliencia.mdx')),
  seguridad: lazy(() => import('@docs/seguridad.mdx')),
  despliegue: lazy(() => import('@docs/despliegue.mdx')),
};

const validSlugs = Object.keys(mdxModules);

export default function DocsPage() {
  const { slug = 'index' } = useParams<{ slug: string }>();
  const components = useMdxComponents();

  if (!validSlugs.includes(slug)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-semibold text-muted-foreground">
          Documento no encontrado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El documento &quot;{slug}&quot; no existe en la documentacion.
        </p>
      </div>
    );
  }

  const MDXContent = mdxModules[slug];

  return (
    <MDXProvider components={components}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">Cargando...</p>
          </div>
        }
      >
        <MDXContent />
      </Suspense>
    </MDXProvider>
  );
}
