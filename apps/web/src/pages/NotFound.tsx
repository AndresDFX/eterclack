import { Link } from 'react-router-dom';
import { ViewfinderCorners } from '@/components/Logo';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-20">
      <div className="relative w-full bg-ink-soft px-8 py-20 text-center">
        <ViewfinderCorners />
        <p className="overline mb-4">Error 404</p>
        <h1 className="text-4xl text-bone md:text-6xl">Fuera de encuadre</h1>
        <p className="mt-5 text-bone-dim">Esta página no existe o cambió de lugar.</p>
        <Link to="/" className="btn btn-primary mt-10">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
