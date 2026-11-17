/** Marca de registro (o alvo que as gráficas usam para alinhar as tintas). É o símbolo do Proxinho. */
export function RegMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="currentColor" />
      <path d="M16 1v30M1 16h30" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Marca de corte em L, desenhada nos quatro cantos de cada carta da folha. */
export function CropCorners() {
  return (
    <svg className="crop" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 6V0h6M94 0h6v6M100 94v6h-6M6 100H0v-6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Tira de controle de cor (ciano, magenta, amarelo, preto) no topo de cada folha. */
export function ColorBar() {
  return (
    <div className="colorbar" aria-hidden="true">
      <span style={{ background: "var(--c)" }} />
      <span style={{ background: "var(--m)" }} />
      <span style={{ background: "var(--y)" }} />
      <span style={{ background: "var(--k)" }} />
      <span style={{ background: "color-mix(in oklab, var(--k) 50%, white)" }} />
      <span style={{ background: "color-mix(in oklab, var(--k) 20%, white)" }} />
    </div>
  );
}
