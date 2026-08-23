const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
  }

  /** Mensaje del primer problema de validación de un campo, si lo hay. */
  fieldError(field: string): string | undefined {
    return this.issues?.find((i) => i.path.includes(field))?.message;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include', // las cookies httpOnly llevan la sesión
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? 'error',
      body.message ?? 'Algo salió mal. Intenta de nuevo.',
      body.issues,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

// ─── Tipos compartidos con la API ────────────────────────────────

export type Role = 'CLIENT' | 'PHOTOGRAPHER' | 'ADMIN';
export type PhotographerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type User = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  emailVerified: boolean;
};

export type Specialty = { id: string; slug: string; name: string; icon?: string | null };
export type Zone = { id: string; slug: string; name: string; department: string };

export type PhotographerCard = {
  id: string;
  slug: string;
  fullName: string;
  headline: string | null;
  priceFromCents: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  specialties: { slug: string; name: string }[];
  zones: { slug: string; name: string }[];
  preview: (string | null)[];
};

export type PackageTier = 'ECONOMICO' | 'MEDIO' | 'ALTO';

export type Package = {
  id: string;
  tier: PackageTier;
  name: string;
  description: string | null;
  includes: string[];
  priceCents: string;
  hours: number;
  maxSelectablePhotos: number;
  deliveryDays: number;
};

export type PhotographerDetail = PhotographerCard & {
  bio: string | null;
  instagram: string | null;
  website: string | null;
  portfolio: { id: string; url: string | null; thumbUrl: string | null; caption: string | null }[];
  packages: Package[];
};

/** COP $1.800.000 — la UI formatea, el servidor calcula. */
export function formatCOP(cents: string | number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const value = BigInt(cents);
  const pesos = value / 100n;
  return `$${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
