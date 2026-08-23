import { Link } from 'react-router-dom';
import { ViewfinderCorners } from '@/components/Logo';

const CLIENT_STEPS = [
  {
    n: '01',
    t: 'Encuentra',
    d: 'Filtra por especialidad, zona y presupuesto. Compara portafolios, paquetes y precios orientativos.',
  },
  {
    n: '02',
    t: 'Solicita',
    d: 'Envías fecha, lugar y qué necesitas. El fotógrafo confirma, ajusta o propone otras condiciones.',
  },
  {
    n: '03',
    t: 'Acepta el contrato',
    d: 'Lees el documento y lo aceptas. Queda registrada la versión, tu nombre, la fecha y la hora.',
  },
  {
    n: '04',
    t: 'Paga',
    d: 'Pagas por Wompi. La reserva se confirma cuando el pago se aprueba, y la fecha queda bloqueada.',
  },
  {
    n: '05',
    t: 'Selecciona',
    d: 'Recibes una galería privada, marcas favoritas y envías tu selección final dentro del límite de tu paquete.',
  },
  {
    n: '06',
    t: 'Descarga',
    d: 'El fotógrafo publica los archivos finales y los descargas con enlaces seguros y temporales.',
  },
];

const PHOTOGRAPHER_STEPS = [
  { n: '01', t: 'Postúlate', d: 'Creas tu perfil con portafolio, especialidades, zonas y paquetes.' },
  { n: '02', t: 'Aprobación', d: 'Administración revisa tu perfil. Solo los aprobados aparecen en búsquedas.' },
  { n: '03', t: 'Recibe solicitudes', d: 'Gestionas leads desde un tablero por estado y bloqueas fechas en tu agenda.' },
  { n: '04', t: 'Entrega', d: 'Subes la galería, revisas la selección del cliente y publicas los archivos finales.' },
  { n: '05', t: 'Cobra', d: 'La plataforma descuenta la comisión y dispersa tu saldo a tu cuenta bancaria.' },
];

export function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-24">
      <header className="mb-16">
        <p className="overline mb-4">El proceso</p>
        <h1 className="text-4xl text-bone md:text-6xl">Cómo funciona EterClack</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-bone-dim">
          Todo el ciclo —descubrir, reservar, firmar, pagar, seleccionar y descargar— ocurre dentro
          de la plataforma. Sin cadenas de mensajes ni transferencias sueltas.
        </p>
      </header>

      <section className="mb-20">
        <h2 className="mb-10 text-2xl text-bone">Si buscas fotógrafo</h2>
        <ol className="space-y-px">
          {CLIENT_STEPS.map((s) => (
            <li key={s.n} className="group flex gap-6 bg-ink-soft p-6 transition-colors hover:bg-ink-line/40">
              <span className="font-[family-name:var(--font-display)] text-sm font-bold text-lime">
                {s.n}
              </span>
              <div>
                <h3 className="text-lg text-bone">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-bone-dim">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-20">
        <h2 className="mb-10 text-2xl text-bone">Si eres fotógrafo</h2>
        <ol className="space-y-px">
          {PHOTOGRAPHER_STEPS.map((s) => (
            <li key={s.n} className="group flex gap-6 bg-ink-soft p-6 transition-colors hover:bg-ink-line/40">
              <span className="font-[family-name:var(--font-display)] text-sm font-bold text-lime">
                {s.n}
              </span>
              <div>
                <h3 className="text-lg text-bone">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-bone-dim">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative bg-ink-soft p-10 text-center md:p-16">
        <ViewfinderCorners />
        <h2 className="text-2xl text-bone md:text-3xl">¿Listo para empezar?</h2>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/fotografos" className="btn btn-primary">
            Buscar fotógrafo
          </Link>
          <Link to="/registro?rol=fotografo" className="btn btn-secondary">
            Postularme como fotógrafo
          </Link>
        </div>
      </section>
    </div>
  );
}
