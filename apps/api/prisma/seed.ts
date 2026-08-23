import { PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto.js';
import { slugify } from '../src/lib/slug.js';
import { seedPortfolio, seedProfileImages } from './seed-photos.js';

const prisma = new PrismaClient();

const PASSWORD = 'Eterclack123*';

const SPECIALTIES = [
  { name: 'Bodas', icon: 'heart' },
  { name: 'Retrato', icon: 'user' },
  { name: 'Producto', icon: 'package' },
  { name: 'Eventos', icon: 'calendar' },
  { name: 'Familia', icon: 'users' },
  { name: 'Moda', icon: 'sparkles' },
  { name: 'Inmobiliaria', icon: 'home' },
  { name: 'Gastronomía', icon: 'utensils' },
];

const ZONES = [
  { name: 'Cali', department: 'Valle del Cauca' },
  { name: 'Palmira', department: 'Valle del Cauca' },
  { name: 'Buga', department: 'Valle del Cauca' },
  { name: 'Bogotá', department: 'Cundinamarca' },
  { name: 'Chía', department: 'Cundinamarca' },
  { name: 'Medellín', department: 'Antioquia' },
  { name: 'Rionegro', department: 'Antioquia' },
  { name: 'Barranquilla', department: 'Atlántico' },
  { name: 'Cartagena', department: 'Bolívar' },
  { name: 'Bucaramanga', department: 'Santander' },
  { name: 'Pereira', department: 'Risaralda' },
  { name: 'Santa Marta', department: 'Magdalena' },
];

type PhotographerSeed = {
  fullName: string;
  email: string;
  headline: string;
  bio: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  priceFromCents: bigint;
  specialties: string[];
  zones: string[];
  verified: boolean;
  photos: number;
};

const PHOTOGRAPHERS: PhotographerSeed[] = [
  {
    fullName: 'María Gómez',
    email: 'maria@eterclack.test',
    headline: 'Bodas con luz natural en el Valle',
    bio: 'Doce años documentando matrimonios sin poses forzadas. Trabajo con luz natural y entrego en 15 días.',
    status: 'APPROVED',
    priceFromCents: 180_000_000n, // COP $1.800.000
    specialties: ['Bodas', 'Retrato', 'Familia'],
    zones: ['Cali', 'Palmira', 'Buga'],
    verified: true,
    photos: 12,
  },
  {
    fullName: 'Andrés Rueda',
    email: 'andres@eterclack.test',
    headline: 'Producto y gastronomía para marcas',
    bio: 'Estudio propio en Medellín. Fotografía de producto para e-commerce y carta de restaurantes.',
    status: 'APPROVED',
    priceFromCents: 45_000_000n, // COP $450.000
    specialties: ['Producto', 'Gastronomía'],
    zones: ['Medellín', 'Rionegro'],
    verified: true,
    photos: 9,
  },
  {
    fullName: 'Laura Peña',
    email: 'laura@eterclack.test',
    headline: 'Retrato editorial y moda',
    bio: 'Retrato editorial, books de actores y campañas de moda independiente en Bogotá.',
    status: 'APPROVED',
    priceFromCents: 90_000_000n, // COP $900.000
    specialties: ['Moda', 'Retrato'],
    zones: ['Bogotá', 'Chía'],
    verified: true,
    photos: 10,
  },
  {
    fullName: 'Carlos Duarte',
    email: 'carlos@eterclack.test',
    headline: 'Eventos corporativos',
    bio: 'Cobertura de congresos, lanzamientos y eventos empresariales.',
    status: 'PENDING',
    priceFromCents: 60_000_000n,
    specialties: ['Eventos'],
    zones: ['Barranquilla', 'Cartagena'],
    verified: false,
    photos: 6,
  },
  {
    fullName: 'Sofía Marín',
    email: 'sofia@eterclack.test',
    headline: 'Inmobiliaria y arquitectura',
    bio: 'Fotografía de espacios para inmobiliarias y arquitectos.',
    status: 'REJECTED',
    priceFromCents: 35_000_000n,
    specialties: ['Inmobiliaria'],
    zones: ['Pereira'],
    verified: false,
    photos: 4,
  },
];

const CLIENTS = [
  { fullName: 'Juliana Restrepo', email: 'juliana@eterclack.test' },
  { fullName: 'Daniel Ospina', email: 'daniel@eterclack.test' },
  { fullName: 'Valentina Cruz', email: 'valentina@eterclack.test' },
];

const CONTRACT_BODY = `# Contrato de prestación de servicios fotográficos

**Entre:** {{fotografo}} (el Fotógrafo) y {{cliente}} (el Cliente).

## 1. Objeto
El Fotógrafo prestará servicios de fotografía el día **{{fecha}}** en **{{lugar}}**, conforme al
paquete **{{paquete}}**.

## 2. Valor y forma de pago
El valor total es de **{{valor}}**, pagado a través de la plataforma EterClack antes de la sesión.

## 3. Entrega
El Fotógrafo entregará las imágenes editadas en un plazo máximo de **{{dias_entrega}} días**
calendario, en galería privada dentro de la plataforma.

## 4. Selección
El Cliente podrá seleccionar hasta **{{max_fotos}}** fotografías del total de la galería.

## 5. Derechos de imagen
El Cliente autoriza el uso de las imágenes con fines de portafolio del Fotógrafo, salvo indicación
expresa en contrario notificada por escrito antes de la sesión.

## 6. Cancelación
Las cancelaciones se rigen por la política publicada en la plataforma al momento de la reserva.

## 7. Tratamiento de datos
Las partes aceptan la política de tratamiento de datos personales de EterClack.

---
Aceptado electrónicamente por {{cliente}} el {{fecha_aceptacion}}.`;

async function main(): Promise<void> {
  console.log('→ Sembrando datos de EterClack…');

  const passwordHash = await hashPassword(PASSWORD);

  // ─── Configuración ────────────────────────────────────────
  const settings: Array<[string, unknown]> = [
    ['platform_commission_bps', 1500],
    ['payout_hold_days', 5],
    ['payout_min_amount_cents', 5_000_000],
    ['contract_template_version', 1],
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  // ─── Catálogo ─────────────────────────────────────────────
  for (const s of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { slug: slugify(s.name) },
      create: { slug: slugify(s.name), name: s.name, icon: s.icon },
      update: { name: s.name, icon: s.icon },
    });
  }
  for (const z of ZONES) {
    await prisma.zone.upsert({
      where: { slug: slugify(z.name) },
      create: { slug: slugify(z.name), name: z.name, department: z.department },
      update: { name: z.name, department: z.department },
    });
  }

  const specialtyBySlug = new Map(
    (await prisma.specialty.findMany()).map((s) => [s.slug, s.id]),
  );
  const zoneBySlug = new Map((await prisma.zone.findMany()).map((z) => [z.slug, z.id]));

  // ─── Contrato ─────────────────────────────────────────────
  await prisma.contractTemplate.upsert({
    where: { version: 1 },
    create: { version: 1, title: 'Contrato de prestación de servicios fotográficos', bodyMd: CONTRACT_BODY },
    update: { bodyMd: CONTRACT_BODY },
  });

  // ─── Usuarios ─────────────────────────────────────────────
  async function upsertUser(email: string, fullName: string, role: Role) {
    return prisma.user.upsert({
      where: { email },
      create: {
        email,
        fullName,
        role,
        passwordHash,
        emailVerifiedAt: new Date(),
        consentAcceptedAt: new Date(),
      },
      update: { fullName, role },
    });
  }

  await upsertUser('admin@eterclack.test', 'Administración EterClack', 'ADMIN');

  for (const c of CLIENTS) {
    await upsertUser(c.email, c.fullName, 'CLIENT');
  }

  for (const p of PHOTOGRAPHERS) {
    const user = await upsertUser(p.email, p.fullName, 'PHOTOGRAPHER');
    const slug = slugify(p.fullName);

    const profile = await prisma.photographerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        slug,
        headline: p.headline,
        bio: p.bio,
        status: p.status,
        priceFromCents: p.priceFromCents,
        approvedAt: p.status === 'APPROVED' ? new Date() : null,
        rejectionReason:
          p.status === 'REJECTED'
            ? 'El portafolio no incluye suficientes trabajos recientes. Agrega al menos 8 imágenes de los últimos 12 meses.'
            : null,
        bankVerifiedAt: p.verified ? new Date() : null,
        legalIdType: p.verified ? 'CC' : null,
        legalIdNumber: p.verified ? '1020304050' : null,
        bankId: p.verified ? '1007' : null,
        bankAccountType: p.verified ? 'SAVINGS' : null,
        bankAccountNumber: p.verified ? '12345678901' : null,
        bankHolderName: p.verified ? p.fullName : null,
      },
      update: {
        headline: p.headline,
        bio: p.bio,
        status: p.status,
        priceFromCents: p.priceFromCents,
      },
    });

    await prisma.photographerSpecialty.deleteMany({ where: { photographerId: profile.id } });
    await prisma.photographerSpecialty.createMany({
      data: p.specialties
        .map((name) => specialtyBySlug.get(slugify(name)))
        .filter((id): id is string => Boolean(id))
        .map((specialtyId) => ({ photographerId: profile.id, specialtyId })),
    });

    await prisma.photographerZone.deleteMany({ where: { photographerId: profile.id } });
    await prisma.photographerZone.createMany({
      data: p.zones
        .map((name) => zoneBySlug.get(slugify(name)))
        .filter((id): id is string => Boolean(id))
        .map((zoneId) => ({ photographerId: profile.id, zoneId })),
    });

    // ── Imágenes ─────────────────────────────────────────────
    // Solo se descargan si el perfil aún no las tiene: volver a sembrar
    // no vuelve a bajar decenas de fotos.
    const existingPhotos = await prisma.portfolioItem.count({
      where: { photographerId: profile.id },
    });

    if (existingPhotos === 0) {
      process.stdout.write(`  ↓ ${p.fullName}: descargando ${p.photos} fotos… `);

      const [{ avatarKey, coverKey }, portfolio] = await Promise.all([
        seedProfileImages(slug),
        seedPortfolio(slug, p.photos),
      ]);

      if (avatarKey || coverKey) {
        await prisma.photographerProfile.update({
          where: { id: profile.id },
          data: { avatarKey, coverKey },
        });
      }

      if (portfolio.length > 0) {
        await prisma.portfolioItem.createMany({
          data: portfolio.map((img, i) => ({
            photographerId: profile.id,
            imageKey: img.imageKey,
            thumbKey: img.thumbKey,
            sortOrder: i,
          })),
        });
      }

      console.log(
        portfolio.length > 0 ? `✓ ${portfolio.length}` : '✗ sin conexión, se omiten',
      );
    }

    // ── Los tres productos ───────────────────────────────────
    // Precio relativo al "desde" del fotógrafo. El contenido definitivo
    // lo define EterClack; aquí queda la estructura.
    const base = p.priceFromCents;
    const TIERS = [
      {
        tier: 'ECONOMICO' as const,
        name: 'Esencial',
        description: 'Cobertura corta con entrega digital.',
        includes: ['2 horas de cobertura', 'Galería privada', 'Entrega digital'],
        priceCents: base,
        hours: 2,
        maxSelectablePhotos: 20,
        deliveryDays: 15,
      },
      {
        tier: 'MEDIO' as const,
        name: 'Completo',
        description: 'Cobertura extendida y más fotografías seleccionables.',
        includes: [
          '4 horas de cobertura',
          'Galería privada',
          'Retoque básico',
          'Entrega prioritaria',
        ],
        priceCents: (base * 175n) / 100n,
        hours: 4,
        maxSelectablePhotos: 50,
        deliveryDays: 20,
      },
      {
        tier: 'ALTO' as const,
        name: 'Premium',
        description: 'Cobertura total con segundo fotógrafo.',
        includes: [
          'Jornada completa',
          'Segundo fotógrafo',
          'Retoque avanzado',
          'Galería y respaldo extendido',
        ],
        priceCents: base * 3n,
        hours: 8,
        maxSelectablePhotos: 120,
        deliveryDays: 25,
      },
    ];

    for (const t of TIERS) {
      await prisma.package.upsert({
        where: { photographerId_tier: { photographerId: profile.id, tier: t.tier } },
        create: { photographerId: profile.id, ...t },
        update: { ...t },
      });
    }

    // ── Calendario: franjas publicadas ───────────────────────
    // Solo los aprobados publican agenda; el cliente únicamente puede
    // reservar sobre lo que exista aquí.
    if (p.status === 'APPROVED') {
      const existingSlots = await prisma.availabilitySlot.count({
        where: { photographerId: profile.id },
      });

      if (existingSlots === 0) {
        const slots: { date: Date; turn: 'MANANA' | 'TARDE' | 'DIA_COMPLETO' }[] = [];
        const today = new Date();
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

        for (let i = 3; i < 75; i++) {
          const date = new Date(start);
          date.setUTCDate(date.getUTCDate() + i);
          const dow = date.getUTCDay();
          if (dow === 0) continue; // no trabaja domingos

          // Fines de semana en jornada completa; entre semana, medias jornadas.
          if (dow === 6) {
            slots.push({ date, turn: 'DIA_COMPLETO' });
          } else if (i % 3 !== 0) {
            slots.push({ date, turn: 'MANANA' });
            if (i % 2 === 0) slots.push({ date, turn: 'TARDE' });
          }
        }

        await prisma.availabilitySlot.createMany({
          data: slots.map((sl) => ({
            photographerId: profile.id,
            date: sl.date,
            turn: sl.turn,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  const counts = {
    usuarios: await prisma.user.count(),
    fotografos: await prisma.photographerProfile.count(),
    especialidades: await prisma.specialty.count(),
    zonas: await prisma.zone.count(),
    paquetes: await prisma.package.count(),
    fotos: await prisma.portfolioItem.count(),
    franjas: await prisma.availabilitySlot.count(),
  };

  console.log('✓ Semilla lista:', counts);
  console.log(`\n  Credenciales (todas con contraseña ${PASSWORD}):`);
  console.log('    admin@eterclack.test      → ADMIN');
  console.log('    maria@eterclack.test      → FOTÓGRAFO aprobado');
  console.log('    carlos@eterclack.test     → FOTÓGRAFO pendiente');
  console.log('    sofia@eterclack.test      → FOTÓGRAFO rechazado');
  console.log('    juliana@eterclack.test    → CLIENTE\n');
}

main()
  .catch((e) => {
    console.error('✗ Error sembrando:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
