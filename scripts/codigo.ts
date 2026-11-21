/**
 * Resumo do código que desenha as cartas (o motor, a entrada de cada montagem e as fontes livres):
 * entra na chave das cartas guardadas no navegador (src/app/cardStore.ts) e das montadas no
 * servidor (ADR 0022), e uma correção no motor faz as cartas serem montadas de novo. Os builds do
 * site e do montador o põem em `__PROXINHO_BUILD__` (vite.config.ts, vite.montagem.config.ts), e o
 * montador o confere com o do site no ar sem precisar das dependências.
 *
 * Uso: node scripts/codigo.ts (na raiz do repositório) imprime o resumo.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Arquivo novo que muda o desenho entra aqui, senão o servidor e o navegador servem a carta velha. */
const DRAWING = [
  "src/engine",
  "src/app/cardStore.ts",
  "src/app/model.ts",
  "src/app/preview.ts",
  "src/app/printFaces.ts",
  "public/fonts/cartas",
];

export function drawingHash(root = "."): string {
  const walk = (path: string): string[] =>
    statSync(join(root, path)).isDirectory() ? readdirSync(join(root, path)).flatMap((name) => walk(join(path, name))) : [path];
  const files = DRAWING.flatMap(walk).sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update(readFileSync(join(root, file)));
  return hash.digest("hex").slice(0, 16);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(drawingHash());
