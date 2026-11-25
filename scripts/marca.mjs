#!/usr/bin/env node
/**
 * Gera as imagens da marca em public/: os ícones do app instalado (manifest.webmanifest) e a
 * prévia do link (og.png, 1200 × 630), desenhados aqui em HTML e SVG e fotografados no Chromium.
 * Tudo vem do DESIGN.md: a marca de registro, as tintas de processo, o papel offset e a Archivo.
 * Nenhuma arte de carta entra (as artes são da Wizards e dos artistas).
 *
 *     node scripts/marca.mjs     # regrava os PNGs; rode de novo ao mudar a marca
 *
 * Sem download de navegador: PW_CHROMIUM_PATH=/caminho/do/chrome node scripts/marca.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const font = readFileSync(join(ROOT, "node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2")).toString("base64");

const INK = "#111418";
const CYAN = "#0086c9";
const MAGENTA = "#c2186b";
const YELLOW = "#ffd400";
const PAPER = "#f4f6f8";

/** A marca de registro (src/components/RegMark.tsx), em `size` px. */
const regMark = (size, color = INK) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="9" fill="none" stroke="${color}" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="${color}"/><path d="M16 1v30M1 16h30" stroke="${color}" stroke-width="2"/></svg>`;

const page = (body, width, height) => `<!doctype html><html><head><style>
@font-face { font-family: Archivo; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
body { font-family: Archivo, sans-serif; color: ${INK}; }
</style></head><body>${body}</body></html>`;

/** Ícone quadrado: a marca de registro preta sobre o ciano de processo (o favicon, em PNG). `pad`: área segura do ícone mascarável. */
const icon = (size, pad) =>
  page(
    `<div style="width:${size}px;height:${size}px;background:${CYAN};display:grid;place-items:center">${regMark(Math.round(size * (1 - 2 * pad)))}</div>`,
    size,
    size,
  );

/** A prévia do link: a folha de prova com a marca, o nome e a promessa do site. */
const og = page(
  `<div style="position:relative;width:1200px;height:630px;background:${PAPER};padding:56px 64px">
    <div style="position:absolute;inset:0 0 auto 0;height:18px;background:${CYAN}"></div>
    <div style="position:relative;height:100%;background:#fff;box-shadow:0 2px 4px rgb(17 20 24 / .08),0 24px 48px -16px rgb(17 20 24 / .22);padding:56px 64px;display:flex;flex-direction:column;justify-content:space-between">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:0">${[CYAN, MAGENTA, YELLOW, INK, "#8a8d90", "#d0d1d1"].map((c) => `<span style="width:44px;height:18px;background:${c}"></span>`).join("")}</div>
        <span style="font-size:22px;font-weight:650;font-stretch:70%;letter-spacing:.04em;color:#56616d">FOLHA 1/1 · TAMANHO REAL 63 × 88 MM</span>
      </div>
      <div style="display:flex;align-items:center;gap:36px">
        ${regMark(150)}
        <div>
          <div style="font-size:124px;font-weight:800;font-stretch:118%;letter-spacing:-.03em;line-height:.95">Proxinho</div>
          <div style="margin-top:22px;font-size:46px;font-weight:700;font-stretch:100%;letter-spacing:-.01em;line-height:1.12;max-width:820px">Proxies com o texto oficial em português, em qualquer arte</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:26px;font-weight:650;font-stretch:80%;color:#3a4450">
        <span>Cole a lista do deck · escolha a arte · baixe o PDF</span>
        <span style="display:flex;align-items:center;gap:10px">${regMark(30, MAGENTA)} grátis, sem cadastro</span>
      </div>
    </div>
  </div>`,
  1200,
  630,
);

const SHOTS = [
  ["icone-192.png", icon(192, 0.16), 192, 192],
  ["icone-512.png", icon(512, 0.16), 512, 512],
  ["icone-mascaravel-512.png", icon(512, 0.24), 512, 512],
  ["apple-touch-icon.png", icon(180, 0.16), 180, 180],
  ["og.png", og, 1200, 630],
];

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
try {
  for (const [file, html, width, height] of SHOTS) {
    const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await tab.setContent(html);
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: join(PUBLIC, file), type: "png" });
    await tab.close();
    console.log(`public/${file}`);
  }
} finally {
  await browser.close();
}
