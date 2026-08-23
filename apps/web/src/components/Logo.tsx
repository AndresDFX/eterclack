type LogoProps = {
  /** sm: barra de navegación · md: pie · lg: portada */
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
};

const SIZES = {
  sm: { text: 'text-xl', corner: 8, gap: 'gap-1', tag: 'text-[7px] tracking-[0.2em]' },
  md: { text: 'text-3xl', corner: 12, gap: 'gap-1.5', tag: 'text-[9px] tracking-[0.22em]' },
  lg: { text: 'text-6xl md:text-8xl', corner: 26, gap: 'gap-3', tag: 'text-xs tracking-[0.28em]' },
} as const;

/**
 * Logotipo EterClack. Reproduce la marca: "eter/clack" apilado en blanco hueso
 * con las escuadras de visor en amarillo lima a la derecha.
 */
export function Logo({ size = 'sm', showTagline = false, className = '' }: LogoProps) {
  const s = SIZES[size];

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <div className={`flex items-start ${s.gap}`}>
        <div className="flex flex-col leading-[0.85]">
          <span className={`font-[family-name:var(--font-display)] font-bold text-bone ${s.text}`}>
            eter
          </span>
          <span className={`font-[family-name:var(--font-display)] font-bold text-bone ${s.text}`}>
            clack
          </span>
        </div>

        {/* Escuadras de visor: el motivo de la marca */}
        <div
          className="flex flex-col justify-between self-stretch"
          aria-hidden="true"
          style={{ gap: s.corner / 2 }}
        >
          <CornerMark size={s.corner} corner="tr" />
          <CornerMark size={s.corner} corner="br" />
        </div>
      </div>

      {showTagline && (
        <span className={`overline mt-2 text-bone-dim ${s.tag}`}>FOTOGRAFÍA Y VIDEO</span>
      )}
    </div>
  );
}

function CornerMark({ size, corner }: { size: number; corner: 'tr' | 'br' }) {
  const thickness = Math.max(2, Math.round(size / 3.2));
  const border =
    corner === 'tr'
      ? { borderTopWidth: thickness, borderRightWidth: thickness }
      : { borderBottomWidth: thickness, borderRightWidth: thickness };

  return (
    <span
      className="block border-lime"
      style={{ width: size, height: size, borderStyle: 'solid', ...border }}
    />
  );
}

/** Marca de visor suelta, para enmarcar secciones. */
export function ViewfinderCorners({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <span className="absolute left-0 top-0 h-4 w-4 border-l-[3px] border-t-[3px] border-lime" />
      <span className="absolute right-0 top-0 h-4 w-4 border-r-[3px] border-t-[3px] border-lime" />
      <span className="absolute bottom-0 left-0 h-4 w-4 border-b-[3px] border-l-[3px] border-lime" />
      <span className="absolute bottom-0 right-0 h-4 w-4 border-b-[3px] border-r-[3px] border-lime" />
    </div>
  );
}
