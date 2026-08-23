// Construye el sitio estático de documentación de EterClack.
//
// Publica los documentos de docs/ y la hoja de contacto con las capturas
// de la interfaz. NO publica la aplicación: Pages sirve archivos estáticos
// y la plataforma necesita API, base de datos y sesiones. Ver docs/08.

import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const DIST = join(AQUI, 'dist');
const DOCS = join(RAIZ, 'docs');

mkdirSync(DIST, { recursive: true });
cpSync(join(AQUI, 'assets'), join(DIST, 'assets'), { recursive: true });

// ─── Documentos ────────────────────────────────────────────────
const TITULOS = {
  '00-plan-implementacion': ['Plan de implementación', 'Alcance, fases, hitos, impacto y riesgos'],
  '01-arquitectura': ['Arquitectura', 'Stack, mapeo Cloudflare → Hostinger, dimensionamiento'],
  '02-entorno-local': ['Entorno local', 'Compose, variables, semillas, pruebas'],
  '03-servidor-correo': ['Servidor de correo', 'DMS, DKIM/SPF/DMARC, entregabilidad'],
  '04-wompi': ['Wompi', 'Recaudo y dispersión a fotógrafos'],
  '05-modelo-datos': ['Modelo de datos', 'Entidades, estados, libro contable'],
  '06-despliegue-hostinger': ['Despliegue Hostinger', 'Provisión, DNS, cutover, operación'],
  '07-plan-de-pruebas': ['Plan de pruebas', 'Qué se prueba, cómo y con qué criterio'],
  '08-plan-de-despliegue': ['Plan de despliegue', 'De local a producción, con reversa definida'],
  '09-despliegue-render': ['Despliegue en Render', 'Puente temporal con URL pública, paso a paso'],
};

const docs = readdirSync(DOCS)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

// ─── Fases ─────────────────────────────────────────────────────
const FASES = [
  ['0', 'Fundaciones', 'Docker, Postgres, Redis, MinIO, esquema, semillas, sistema de marca', true],
  ['1', 'Identidad', 'Registro, verificación, sesiones, RBAC por recurso, auditoría', true],
  ['2', 'Descubrimiento', 'Perfiles, aprobación, tres productos, búsqueda con filtros', true],
  ['3', 'Calendario y reserva', 'El fotógrafo publica franjas; el cliente reserva directo', true],
  ['4', 'Contrato y PWA', 'Evidencia inmutable de aceptación; app instalable', true],
  ['5', 'Galerías y entrega', 'Subida directa, miniaturas, selección, descargas firmadas', false],
  ['6', 'Wompi recaudo', 'Checkout, firma de integridad, webhook idempotente', false],
  ['7', 'Wompi dispersión', 'Libro contable, KYC bancario, corridas de pago', false],
  ['8', 'Correo propio', 'docker-mailserver, DKIM, rebotes, supresión', false],
  ['9', 'Hostinger', 'VPS, DNS, TLS, MX, calentamiento, producción', false],
];

// ─── Hoja de contacto ──────────────────────────────────────────
const ui = JSON.parse(readFileSync(join(AQUI, 'assets/ui.json'), 'utf-8'));

const ROLLOS = [
  ['Visitante', 'Sin cuenta. Lo que ve alguien que llega por primera vez.', [
    ['01-inicio', 'Portada', 'La marca, las especialidades y el proceso en cuatro pasos.'],
    ['02-buscar', 'Búsqueda', 'Filtros por especialidad, zona y presupuesto.'],
    ['03-perfil', 'Ficha del fotógrafo', 'Biografía, los tres productos y el portafolio completo.'],
    ['04-como-funciona', 'Cómo funciona', 'El recorrido explicado para cada lado.'],
    ['05-ingresar', 'Ingreso', 'Sesión con cookie httpOnly y refresh rotativo.'],
    ['06-registro', 'Registro', 'Un formulario decide el rol: contratar o trabajar.'],
  ]],
  ['Cliente', 'Con la cuenta verificada. Aquí ocurre la reserva.', [
    ['07-reservar', 'Reservar cita', 'Tres productos, calendario y resumen. Sin negociación.'],
    ['08-mis-citas', 'Mis citas', 'Estado de cada reserva y qué falta para confirmarla.'],
  ]],
  ['Fotógrafo', 'Su panel: perfil, agenda y citas recibidas.', [
    ['10-panel-perfil', 'Mi perfil', 'Presentación, especialidades y zonas.'],
    ['11-panel-citas', 'Mis citas', 'Lo que va a cobrar, ya descontada la comisión.'],
    ['12-panel-calendario', 'Mi calendario', 'Publica jornadas. Sin franja no hay cita.'],
  ]],
  ['Administración', 'Control de quién entra a la plataforma.', [
    ['13-admin', 'Panel de control', 'Indicadores y revisión de postulaciones.'],
  ]],
  ['Móvil · PWA', 'La misma app, instalable desde el navegador.', [
    ['20-movil-inicio', 'Portada en móvil', 'Diseño responsivo con el menú plegado.'],
    ['21-movil-reservar', 'Reserva en móvil', 'Productos apilados y calendario tocable.'],
  ]],
];

// ─── Plantilla ─────────────────────────────────────────────────
function pagina({ titulo, subtitulo, cuerpo, activo, ancho = 'doc' }) {
  const nav = [
    ['index.html', 'Inicio'],
    ['interfaz.html', 'La interfaz'],
    ...docs.map((d) => [`${d}.html`, TITULOS[d]?.[0] ?? d]),
  ];

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1D1D1B">
<title>${titulo === 'EterClack' ? 'EterClack' : `${titulo} · EterClack`}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>

<div class="marco">
  <aside class="lateral">
    <a class="marca" href="index.html" aria-label="EterClack, inicio">
      <span class="marca-tipo">eter<br>clack</span>
      <span class="marca-esq"><i class="esq tr"></i><i class="esq br"></i></span>
    </a>
    <nav>
      ${nav.map(([href, label]) =>
        `<a href="${href}"${href === activo ? ' aria-current="page"' : ''}>${label}</a>`).join('\n      ')}
    </nav>
    <p class="lateral-pie">ETERnidad<br>a un solo CLACK</p>
  </aside>

  <main id="contenido" class="${ancho}">
    <header class="cabecera">
      <h1>${titulo}</h1>
      ${subtitulo ? `<p class="lede">${subtitulo}</p>` : ''}
    </header>
    ${cuerpo}
  </main>
</div>
</body>
</html>`;
}

// ─── Estilos ───────────────────────────────────────────────────
writeFileSync(join(DIST, 'styles.css'), readFileSync(join(AQUI, 'styles.css'), 'utf-8'));

// ─── Índice ────────────────────────────────────────────────────
const indice = `
<section class="aviso">
  <p class="overline">Sobre este sitio</p>
  <p>
    Aquí está la documentación del proyecto y las capturas de la interfaz.
    <strong>La aplicación no corre en esta dirección</strong>: GitHub Pages sirve archivos
    estáticos, y la plataforma necesita API, base de datos, almacenamiento y sesiones.
    Su destino es un VPS — el detalle está en
    <a href="08-plan-de-despliegue.html">el plan de despliegue</a>.
  </p>
</section>

<section>
  <h2>Estado por fases</h2>
  <ol class="fases">
    ${FASES.map(([n, t, d, hecho]) => `
    <li class="${hecho ? 'ok' : 'pend'}">
      <span class="fase-n">${n}</span>
      <div>
        <h3>${t}</h3>
        <p>${d}</p>
      </div>
      <span class="fase-estado">${hecho ? 'Hecho' : 'Pendiente'}</span>
    </li>`).join('')}
  </ol>
</section>

<section>
  <h2>Documentación</h2>
  <div class="tarjetas">
    ${docs.map((d) => {
      const [t, s] = TITULOS[d] ?? [d, ''];
      return `<a class="tarjeta" href="${d}.html"><span class="overline">${d.slice(0, 2)}</span><h3>${t}</h3><p>${s}</p></a>`;
    }).join('')}
  </div>
</section>

<section>
  <h2>Cómo levantarla</h2>
  <p>Requisito único: Docker.</p>
  <pre><code>git clone &lt;este-repositorio&gt;
cd eterclack
cp .env.example .env
npm run up
npm run db:migrate
npm run db:seed</code></pre>
  <p>La web queda en <code>localhost:5173</code> y los correos se capturan en
     <code>localhost:8025</code>.</p>
</section>`;

writeFileSync(join(DIST, 'index.html'), pagina({
  titulo: 'EterClack',
  subtitulo: 'Marketplace de servicios fotográficos. Reserva directa sobre calendario, contrato con evidencia y pagos con dispersión al fotógrafo.',
  cuerpo: indice,
  activo: 'index.html',
}));

// ─── Hoja de contacto ──────────────────────────────────────────
const interfaz = ROLLOS.map(([rol, nota, frames]) => `
<section class="rollo">
  <div class="rollo-cab">
    <h2>${rol}</h2>
    <p>${nota}</p>
  </div>
  <div class="hoja">
    ${frames.map(([key, t, d]) => {
      const img = ui[key];
      if (!img) return '';
      const alto = img.w < 800 ? ' alto' : '';
      return `
    <figure class="cuadro${alto}">
      <a href="${img.src}" target="_blank" rel="noreferrer">
        <span class="sello">${key.slice(0, 2)}</span>
        <img src="${img.src}" alt="${t}" loading="lazy" width="${img.w}" height="${img.h}">
      </a>
      <figcaption><h3>${t}</h3><p>${d}</p></figcaption>
    </figure>`;
    }).join('')}
  </div>
</section>`).join('');

writeFileSync(join(DIST, 'interfaz.html'), pagina({
  titulo: 'La interfaz',
  subtitulo: 'Las 14 pantallas construidas, capturadas del entorno local con datos reales. Cada imagen abre en tamaño completo.',
  cuerpo: interfaz,
  activo: 'interfaz.html',
  ancho: 'ancho',
}));

// ─── Documentos a HTML ─────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: false });

for (const d of docs) {
  const md = readFileSync(join(DOCS, `${d}.md`), 'utf-8');
  // El primer encabezado pasa a ser el título de la página, no del cuerpo.
  const sinH1 = md.replace(/^#\s+.+\n/, '');
  const [titulo, subtitulo] = TITULOS[d] ?? [d, ''];
  let html = marked.parse(sinH1);
  // Los enlaces entre documentos apuntan a .md en el repositorio
  html = html.replace(/href="((?:\.\/)?\d{2}-[a-z-]+)\.md(#[^"]*)?"/g, 'href="$1.html$2"');
  html = html.replace(/<table>/g, '<div class="tabla"><table>').replace(/<\/table>/g, '</table></div>');

  writeFileSync(join(DIST, `${d}.html`), pagina({
    titulo, subtitulo, cuerpo: `<article class="md">${html}</article>`, activo: `${d}.html`,
  }));
}

// GitHub Pages no debe procesar esto con Jekyll
writeFileSync(join(DIST, '.nojekyll'), '');

if (existsSync(join(RAIZ, 'base/ETERCLACK - FOTO DE PERFIL-04.jpg'))) {
  cpSync(join(RAIZ, 'base/ETERCLACK - FOTO DE PERFIL-04.jpg'), join(DIST, 'assets/logo.jpg'));
}

console.log(`✓ sitio construido: ${docs.length + 2} páginas, ${Object.keys(ui).length} capturas`);
