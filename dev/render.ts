import { renderCard } from "../src/engine/render";
const fx = await (await fetch("/dev/fixture.json")).json();
const only = new URLSearchParams(location.search).get("i");
const list = only ? [fx[+only]] : fx;
const t0 = performance.now();
for (const f of list) {
  const face = f.card.faces[0];
  const tp = f.card.text_print;
  const flavor = tp && tp.set === f.print.set_code && tp.number === f.print.number ? face.flavor_pt : null;
  const { canvas } = await renderCard({ print: f.print, face, flavor, scale: 1 });
  canvas.title = f.card.name_en;
  document.body.append(canvas);
}
document.body.dataset.ms = String(Math.round(performance.now() - t0));
document.body.dataset.ready = "1";
