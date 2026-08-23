/**
 * Todo el dinero del sistema es BigInt de CENTAVOS y toda tasa es Int de PUNTOS BASE.
 * Cero aritmética de punto flotante en el camino del dinero.
 *
 *   COP $50.000  →  5_000_000n
 *   15 %         →  1500 bps
 */

export const BPS_DIVISOR = 10_000n;

/** Comisión de la plataforma, redondeada hacia abajo (a favor del fotógrafo). */
export function commissionFrom(amountCents: bigint, bps: number): bigint {
  if (bps < 0 || bps > 10_000) throw new Error(`bps fuera de rango: ${bps}`);
  return (amountCents * BigInt(bps)) / BPS_DIVISOR;
}

/** Reparte un monto entre comisión y neto del fotógrafo. Siempre suma exacto. */
export function splitAmount(
  amountCents: bigint,
  bps: number,
): { commissionCents: bigint; photographerCents: bigint } {
  const commissionCents = commissionFrom(amountCents, bps);
  return { commissionCents, photographerCents: amountCents - commissionCents };
}

/** COP $1.234.567 para mostrar. La UI formatea; el servidor calcula. */
export function formatCOP(amountCents: bigint): string {
  const pesos = amountCents / 100n;
  const cents = amountCents % 100n;
  const formatted = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return cents === 0n ? `$${formatted}` : `$${formatted},${cents.toString().padStart(2, '0')}`;
}

export function pesosToCents(pesos: number): bigint {
  return BigInt(Math.round(pesos * 100));
}
