/**
 * Imagem da prévia de uma face: a acabada quando fica pronta e, enquanto isso, o rascunho das
 * cartas que esperam a rede neural (ver `draftUrl`). A folha e a gaveta usam o mesmo.
 */
import { useEffect, useState } from "react";
import { fontsVersion } from "../engine/fonts";
import { draftUrl, previewUrl } from "../app/preview";
import { renderKey, type Entry, type Side } from "../app/model";

export type PreviewState = { key: string; url?: string; draft?: string; error?: string };

export function usePreview(entry: Entry, side: Side, attempt = 0): PreviewState {
  const key = renderKey(entry, fontsVersion(), side);
  const [state, setState] = useState<PreviewState>({ key });

  useEffect(() => {
    let alive = true;
    previewUrl(entry, side).then(
      (url) => alive && setState({ key, url }),
      (err: Error) => alive && setState({ key, error: err.message }),
    );
    draftUrl(entry, side)?.then(
      (draft) => alive && setState((s) => (s.key === key && !s.url && !s.error ? { key, draft } : s)),
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // a chave da imagem resume tudo que muda o desenho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  return state.key === key ? state : { key };
}
