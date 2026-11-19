/**
 * Andamento da rede neural numa carta que espera por ela (artes sem borda e planeswalkers): na
 * folha, uma faixa curta sobre o rascunho; na gaveta, a frase inteira, a barra e, no primeiro
 * download, o tamanho; depois, onde o modelo roda (no processador, por que ali e não na placa de
 * vídeo). Sem isso, a espera do celular sem placa de vídeo (um a dois minutos) parecia travada e
 * a pessoa desistia.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { browserGpu, neuralLine, neuralWhere } from "../app/labels";
import { neuralProgress, onNeuralProgress } from "../app/preview";
import { lamaStatus, onLamaStatus } from "../engine/lama";

export function NeuralStage({ previewKey, long = false }: { previewKey: string; long?: boolean }) {
  const status = useSyncExternalStore(onLamaStatus, lamaStatus);
  const progress = useSyncExternalStore(onNeuralProgress, () => neuralProgress(previewKey));
  const [now, setNow] = useState(() => Date.now());
  // o tempo que falta anda sozinho entre um quadro e outro
  const ticking = progress?.state === "running" && status.stage === "run" && status.frameMs > 0;
  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ticking, status.since]);
  const line = neuralLine(status, progress, now);
  if (!line) return null;
  const where = long ? neuralWhere(status.backend, browserGpu(), status.gpu) : null;
  if (!long)
    return (
      <span className="slot-finishing">
        <span className="slot-finishing-text">{line.short}</span>
        <Bar percent={line.percent} />
      </span>
    );
  return (
    <span className="finishing">
      <span className="finishing-text">{line.text}</span>
      <Bar percent={line.percent} label={line.text} />
      {status.stage === "download" && status.total > 0 && progress?.state === "running" && (
        <span className="finishing-note">{`${Math.round(status.total / 1e6)} MB, só na primeira vez: depois fica guardado no navegador.`}</span>
      )}
      {status.stage === "run" && progress?.state === "running" && where && <span className="finishing-note">{where}</span>}
    </span>
  );
}

/** Barra de andamento: com número quando há medida; sem, uma faixa em movimento. */
function Bar({ percent, label }: { percent: number | null; label?: string }) {
  return percent === null ? (
    <span
      className="finishing-bar finishing-bar--busy"
      aria-hidden={label ? undefined : true}
      role={label ? "progressbar" : undefined}
      aria-label={label}
    />
  ) : (
    <progress className="finishing-bar" max={100} value={percent} aria-hidden={label ? undefined : true} aria-label={label} />
  );
}
