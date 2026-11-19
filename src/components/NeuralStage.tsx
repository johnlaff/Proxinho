/**
 * Andamento da rede neural que apaga o inglês, sob o aviso de prévia montando (só nas cartas que
 * esperam por ela: artes sem borda e planeswalkers). No celular sem placa de vídeo a primeira
 * carta leva de um a dois minutos; sem isto, a espera parecia travada.
 */
import { useSyncExternalStore } from "react";
import { neuralStage } from "../app/labels";
import { lamaStatus, onLamaStatus } from "../engine/lama";

export function NeuralStage({ long = false }: { long?: boolean }) {
  const status = useSyncExternalStore(onLamaStatus, lamaStatus);
  const stage = neuralStage(status);
  if (!stage) return null;
  return (
    <span className="slot-stage">
      <span>{stage.text}</span>
      {long && stage.percent !== null && <progress max={100} value={stage.percent} aria-label={stage.text} />}
      {long && status.stage === "download" && status.total > 0 && (
        <span className="slot-stage-note">{`${Math.round(status.total / 1e6)} MB, só na primeira vez: depois fica guardado no navegador.`}</span>
      )}
    </span>
  );
}
