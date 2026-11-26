#!/usr/bin/env node
/**
 * Regressão visual: monta a amostra fixa de impressões (scripts/regressao/amostra.json, ~630, com
 * todas as cartas em que o motor já errou) com o código desta árvore e com o de outro commit, e
 * compara pixel a pixel. Nenhuma mudança no motor é publicada sem passar por aqui (AGENTS.md).
 *
 * Usa a mesma página do montador em lote (src/montagem/pagina.ts, ADR 0022): as cartas saem
 * exatamente como o site e o servidor as montam, na resolução do PDF (300 dpi). As imagens e o
 * relatório ficam só na máquina, em .regressao/ (fora do Git): o repositório é público e não
 * guarda imagens das cartas.
 *
 *   pnpm regressao                         # árvore atual contra origin/main
 *   pnpm regressao -- --base HEAD~1        # contra outro commit
 *   pnpm regressao -- --sem-rede           # rodada rápida, sem as faces da rede neural
 *
 * Opções:
 *   --base REF        commit de comparação (padrão: origin/main)
 *   --api URL         de onde vêm os dados e as fontes oficiais (padrão: o site no ar); para
 *                     testar dados novos do pipeline, suba o `pnpm dev` com o D1 local e passe
 *                     http://localhost:5173. Uma fonte que está em `.fontes-oficiais/` (a mesma
 *                     pasta do `pnpm fonts:local`) vem de lá: a fonte nova de uma moldura nova
 *                     ainda não está no KV do site antes da publicação (a `medieval.ttf`, ADR 0031)
 *   --sem-rede        pula as faces que passam pela rede neural (sem borda, planeswalkers, naves)
 *   --grupo NOME      só um grupo da amostra ("sem borda", "2003", "citada nos documentos"...)
 *   --amostra ARQUIVO outra lista de impressões, no formato de amostra.json (para conferir todas as
 *                     impressões de uma moldura ao mexer nela; a regra de publicar continua sendo a
 *                     amostra fixa)
 *   --paginas N       montagens comuns ao mesmo tempo (padrão 3; a rede neural tem uma à parte)
 *   --de-novo         monta as duas de novo, sem as montagens guardadas
 *   --ruido           monta o lado novo de novo do zero (com --base HEAD, mede a variação entre duas
 *                     montagens do mesmo código: deve dar zero fora da rede neural)
 *   --limiar N        diferença por canal, de 0 a 255, que conta como pixel mudado (padrão 24:
 *                     abaixo disso é ruído da compressão JPEG em volta de uma mudança)
 *
 * Cada montagem fica guardada por resumo do código (`drawingHash`) e data dos dados: rodar de novo
 * contra a mesma base só monta o lado novo. O relatório (.regressao/relatorio/index.html) lista
 * as cartas que mudaram, da maior mudança para a menor, com antes, depois, a diferença e o zoom no
 * trecho que mudou.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { drawingHash } from "../codigo.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const WORK = join(ROOT, ".regressao");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("--base", "origin/main");
const API = opt("--api", "https://proxinho.johnlaff.com").replace(/\/$/, "");
const PAGES = Number(opt("--paginas", "3"));
const THRESHOLD = Number(opt("--limiar", "24"));
const GROUP = opt("--grupo");
const SAMPLE = opt("--amostra");
const NO_NEURAL = flag("--sem-rede");
const KIND = "impressao:padrao";

const log = (...a) => console.log(`[regressão ${new Date().toISOString().slice(11, 19)}]`, ...a);
const run = (cmd, argv, cwd = ROOT) => execFileSync(cmd, argv, { cwd, stdio: ["ignore", "inherit", "inherit"] });

/** A amostra, ou só um grupo dela. */
function sample() {
  const all = JSON.parse(readFileSync(SAMPLE ? resolve(SAMPLE) : join(import.meta.dirname, "amostra.json"), "utf8"));
  return GROUP ? all.filter((s) => s.grupo === GROUP) : all;
}

/** Uma cópia limpa do commit de comparação, com as dependências e o modelo desta árvore. */
function baseTree() {
  const sha = execFileSync("git", ["rev-parse", BASE], { cwd: ROOT, encoding: "utf8" }).trim();
  const dir = join(WORK, "base-src");
  const current = existsSync(dir) ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim() : null;
  if (current !== sha) {
    if (existsSync(dir)) run("git", ["worktree", "remove", "--force", dir]);
    run("git", ["worktree", "add", "--detach", dir, sha]);
    try {
      run("pnpm", ["install", "--frozen-lockfile", "--offline", "--silent"], dir);
    } catch {
      run("pnpm", ["install", "--frozen-lockfile", "--silent"], dir);
    }
  }
  // o modelo da rede neural é o mesmo (scripts/modelo.mjs confere pela soma) e fica fora do Git
  const models = join(dir, "public", "modelos");
  if (!existsSync(models)) symlinkSync(join(ROOT, "public", "modelos"), models);
  return { dir, sha };
}

/** O build da página do montador de uma árvore, guardado pelo resumo do código. */
function buildPage(dir, hash) {
  const out = join(WORK, "paginas", hash);
  if (!existsSync(join(out, "scripts", "montagem", "index.html"))) {
    log(`build da página do montador (${hash})`);
    run("pnpm", ["exec", "vite", "build", "--config", "vite.montagem.config.ts", "--outDir", out, "--logLevel", "warn"], dir);
  }
  return out;
}

/** Uma porta livre agora (o sistema escolhe). */
function freePort() {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.once("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

/**
 * Serve um build da página com o isolamento de origem (as threads da rede neural pedem). Numa porta
 * livre e num grupo de processos próprio, parado inteiro no fim: com uma porta fixa, o `vite
 * preview` de uma rodada anterior (o `pnpm` morria e o `vite` ficava) respondia no lugar do build
 * novo, e a rodada comparava o código velho com ele mesmo sem nenhum aviso.
 */
async function serve(outDir) {
  const port = await freePort();
  const child = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--config", "vite.montagem.config.ts", "--outDir", outDir, "--port", String(port), "--strictPort"],
    {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
    },
  );
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* já parou */
    }
  };
  process.once("exit", stop);
  const url = `http://localhost:${port}/scripts/montagem/index.html`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  throw new Error(`a página do montador não subiu em ${url}`);
}

async function fetchCards(ids) {
  const res = await fetch(`${API}/api/cards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`/api/cards: ${res.status}`);
  return (await res.json()).results;
}

async function openPage(browser, url) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => log("[página]", e.message));
  // as fontes oficiais vêm da API (a página do montador não tem a API)
  await page.route("**/api/fontes/**", async (route) => {
    const u = new URL(route.request().url());
    const local = join(ROOT, ".fontes-oficiais", basename(u.pathname));
    if (existsSync(local)) return route.fulfill({ status: 200, body: readFileSync(local), headers: { "content-type": "font/ttf" } });
    const r = await fetch(API + u.pathname + u.search);
    await route.fulfill({
      status: r.status,
      body: Buffer.from(await r.arrayBuffer()),
      headers: { "content-type": r.headers.get("content-type") ?? "font/ttf" },
    });
  });
  await page.goto(url);
  await page.waitForSelector("body[data-ready='1']", { state: "attached" });
  return page;
}

const fileOf = (job) => `${job.set}-${job.number}-${job.side}.jpg`.replace(/[^\w.★-]/g, "_");

/** Monta a amostra com um build e grava cada face em `dir` (pula as que já estão lá, salvo as que deram erro). */
async function renderAll(browser, url, dir, items) {
  mkdirSync(dir, { recursive: true });
  const metaFile = join(dir, "faces.json");
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
  const wanted = new Set(items.map((s) => s.id));
  const group = new Map(items.map((s) => [s.id, s.grupo]));
  const planner = await openPage(browser, url);
  const { fonts } = await planner.evaluate(() => window.montagem.ready());
  if (fonts !== "o|o") throw new Error(`As fontes oficiais não carregaram (${fonts}).`);
  const oracles = [...new Set(items.map((s) => s.oracle_id))];
  const results = [];
  const jobs = [];
  for (let i = 0; i < oracles.length; i += 100) {
    const r = await fetchCards(oracles.slice(i, i + 100));
    results.push(...r);
    const planned = await planner.evaluate((x) => window.montagem.plan(x, true), r);
    await planner.evaluate(() => window.montagem.forget());
    jobs.push(...planned.filter((j) => wanted.has(j.printId) && !(NO_NEURAL && j.neural)));
  }
  await planner.close();
  // a face que deu erro é montada de novo: numa rodada interrompida, as que estavam na fila
  // falham todas com o navegador fechado, e seriam puladas na seguinte como se estivessem prontas
  const todo = jobs.filter((j) => !meta[fileOf(j)] || meta[fileOf(j)].erro);
  log(`${jobs.length} faces na amostra, ${todo.length} a montar em ${dir.replace(ROOT + "/", "")}`);
  const pages = [];
  for (let i = 0; i < PAGES; i++) pages.push(await openPage(browser, url));
  const neuralPage = await openPage(browser, url);
  await Promise.all([...pages, neuralPage].map((p) => p.evaluate((r) => window.montagem.plan(r), results)));
  let done = 0;
  const started = Date.now();
  const work = async (page, queue) => {
    for (let job; (job = queue.shift());) {
      const name = fileOf(job);
      try {
        const [made] = await page.evaluate(([j, k]) => window.montagem.render(j, k), [job, [KIND]]);
        writeFileSync(join(dir, name), Buffer.from(made.data, "base64"));
        meta[name] = {
          nome: job.name,
          set: job.set,
          number: job.number,
          side: job.side,
          grupo: group.get(job.printId),
          neural: job.neural,
          translated: made.translated,
          reason: made.reason,
          ms: made.ms,
        };
      } catch (err) {
        meta[name] = {
          nome: job.name,
          set: job.set,
          number: job.number,
          side: job.side,
          grupo: group.get(job.printId),
          neural: job.neural,
          erro: err.message.split("\n")[0],
        };
      }
      if (++done % 25 === 0) {
        writeFileSync(metaFile, JSON.stringify(meta));
        log(`${done} de ${todo.length} (${((Date.now() - started) / done / 1000).toFixed(1)} s por face)`);
      }
    }
  };
  const common = todo.filter((j) => !j.neural);
  const neural = todo.filter((j) => j.neural);
  await Promise.all([...pages.map((p) => work(p, common)), work(neuralPage, neural)]);
  await Promise.all([...pages, neuralPage].map((p) => p.close()));
  writeFileSync(metaFile, JSON.stringify(meta));
  return meta;
}

/** Compara as duas montagens no navegador (pixel a pixel) e grava a diferença e o zoom. */
async function compare(browser, baseDir, newDir, baseMeta, newMeta, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "img"), { recursive: true });
  const page = await browser.newPage();
  const rows = [];
  const names = [...new Set([...Object.keys(baseMeta), ...Object.keys(newMeta)])].sort();
  for (const name of names) {
    const a = baseMeta[name];
    const b = newMeta[name];
    const row = { name, ...(b ?? a), antes: a, depois: b };
    if (!a || !b || a.erro || b.erro) {
      row.status = !a ? "nova na amostra" : !b ? "saiu da amostra" : b.erro ? `erro: ${b.erro}` : "voltou a montar";
      rows.push(row);
      continue;
    }
    if (a.translated && !b.translated) row.status = `passou a sair em inglês (${b.reason ?? "?"})`;
    else if (!a.translated && b.translated) row.status = "passou a sair em português";
    const bufA = readFileSync(join(baseDir, name));
    const bufB = readFileSync(join(newDir, name));
    if (bufA.equals(bufB)) {
      if (row.status) rows.push(row);
      continue;
    }
    const diff = await page.evaluate(
      async ([da, db, limiar]) => {
        const load = async (b64) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        const [ia, ib] = await Promise.all([load(da), load(db)]);
        const w = Math.max(ia.width, ib.width);
        const h = Math.max(ia.height, ib.height);
        const px = (img) => {
          const c = new OffscreenCanvas(w, h);
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, w, h).data;
        };
        const pa = px(ia);
        const pb = px(ib);
        const heat = new OffscreenCanvas(w, h);
        const hg = heat.getContext("2d");
        hg.drawImage(ib, 0, 0);
        hg.fillStyle = "rgba(255,255,255,0.75)";
        hg.fillRect(0, 0, w, h);
        const hd = hg.getImageData(0, 0, w, h);
        let changed = 0;
        let max = 0;
        let x0 = w;
        let y0 = h;
        let x1 = -1;
        let y1 = -1;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
          if (d > max) max = d;
          if (d <= limiar) continue;
          changed++;
          const p = i / 4;
          const x = p % w;
          const y = (p - x) / w;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          hd.data[i] = 230;
          hd.data[i + 1] = 0;
          hd.data[i + 2] = 90;
        }
        if (!changed) return { changed, max };
        hg.putImageData(hd, 0, 0);
        const png = async (canvas) => {
          const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        };
        // o trecho que mudou, com folga, ampliado até 480 px de largura
        const pad = 24;
        const cx = Math.max(0, x0 - pad);
        const cy = Math.max(0, y0 - pad);
        const cw = Math.min(w, x1 + pad) - cx;
        const ch = Math.min(h, y1 + pad) - cy;
        const scale = Math.min(3, 480 / cw, 480 / ch);
        const crop = async (img) => {
          const c = new OffscreenCanvas(Math.round(cw * scale), Math.round(ch * scale));
          const g = c.getContext("2d");
          g.imageSmoothingEnabled = false;
          g.drawImage(img, cx, cy, cw, ch, 0, 0, c.width, c.height);
          return png(c);
        };
        return { changed, max, box: [x0, y0, x1, y1], heat: await png(heat), zoomA: await crop(ia), zoomB: await crop(ib) };
      },
      [bufA.toString("base64"), bufB.toString("base64"), THRESHOLD],
    );
    if (!diff.changed && !row.status) continue;
    row.changed = diff.changed;
    row.max = diff.max;
    row.box = diff.box;
    if (diff.changed) {
      const stem = name.replace(/\.jpg$/, "");
      writeFileSync(join(outDir, "img", `${stem}-antes.jpg`), bufA);
      writeFileSync(join(outDir, "img", `${stem}-depois.jpg`), bufB);
      writeFileSync(join(outDir, "img", `${stem}-diferenca.png`), Buffer.from(diff.heat, "base64"));
      writeFileSync(join(outDir, "img", `${stem}-zoom-antes.png`), Buffer.from(diff.zoomA, "base64"));
      writeFileSync(join(outDir, "img", `${stem}-zoom-depois.png`), Buffer.from(diff.zoomB, "base64"));
      row.stem = stem;
    }
    row.status ??= "mudou";
    rows.push(row);
  }
  await page.close();
  return rows;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function report(rows, info, outDir) {
  rows.sort((a, b) => (b.status !== "mudou") - (a.status !== "mudou") || (b.changed ?? 0) - (a.changed ?? 0));
  const cards = rows
    .map((r) => {
      const title = `${esc(r.nome)} · ${esc(r.set.toUpperCase())} ${esc(r.number)}${r.side ? " (verso)" : ""}`;
      const stats = r.changed ? `${r.changed.toLocaleString("pt-BR")} pixels mudaram (máx. ${r.max}), trecho ${r.box.join(", ")}` : "";
      const imgs = r.stem
        ? `<div class="imgs"><figure><img src="img/${r.stem}-antes.jpg" alt="antes"><figcaption>antes</figcaption></figure><figure><img src="img/${r.stem}-depois.jpg" alt="depois"><figcaption>depois</figcaption></figure><figure><img src="img/${r.stem}-diferenca.png" alt="diferença"><figcaption>diferença</figcaption></figure></div><div class="imgs zoom"><figure><img src="img/${r.stem}-zoom-antes.png" alt="zoom antes"><figcaption>zoom antes</figcaption></figure><figure><img src="img/${r.stem}-zoom-depois.png" alt="zoom depois"><figcaption>zoom depois</figcaption></figure></div>`
        : "";
      return `<section><h2>${title}</h2><p><strong>${esc(r.status)}</strong> · ${esc(r.grupo ?? "")}${r.neural ? " · rede neural" : ""}${stats ? ` · ${stats}` : ""}</p>${imgs}</section>`;
    })
    .join("\n");
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Regressão do Proxinho</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#111418;background:#f4f6f8}section{background:#fff;border:1px solid #c5ced7;border-radius:6px;padding:12px 16px;margin:16px 0}h1{font-size:24px}h2{font-size:17px;margin:0 0 4px}.imgs{display:flex;gap:12px;flex-wrap:wrap}.imgs img{width:300px;height:auto;border:1px solid #c5ced7}.zoom img{width:auto;max-width:480px}figure{margin:0}figcaption{font-size:12px;color:#56616d}</style>
<h1>Regressão do Proxinho</h1><p>${esc(info)}</p>${cards || "<p>Nenhuma carta mudou.</p>"}</html>`;
  writeFileSync(join(outDir, "index.html"), html);
}

async function main() {
  const items = sample();
  mkdirSync(WORK, { recursive: true });
  const health = await (await fetch(`${API}/api/health`)).json();
  const dataTag = String(health.dataUpdatedAt ?? "local").replace(/[^\dTZ]/g, "");
  if (!existsSync(join(ROOT, "public", "modelos", "lama-int4.onnx.gz.0"))) run("node", ["scripts/modelo.mjs"]);

  const base = baseTree();
  // o resumo pela lista de arquivos da própria base (a lista pode ter mudado de um commit a outro)
  const baseHash = execFileSync("node", ["scripts/codigo.ts"], { cwd: base.dir, encoding: "utf8" }).trim();
  const newHash = drawingHash(ROOT);
  log(
    `base ${BASE} (${base.sha.slice(0, 8)}, código ${baseHash}) contra a árvore (código ${newHash}); dados de ${health.dataUpdatedAt ?? API}`,
  );
  if (baseHash === newHash) log("o código que desenha é o mesmo nos dois: a comparação mostra só o ruído (deve dar zero)");
  const basePage = buildPage(base.dir, baseHash);
  const newPage = baseHash === newHash ? basePage : buildPage(ROOT, `${newHash}-arvore`);

  const { chromium } = createRequire(import.meta.url)("@playwright/test");
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu"], executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const sA = await serve(basePage);
  const sB = baseHash === newHash ? sA : await serve(newPage);
  try {
    // cada montagem fica guardada pelo resumo do código e pela data dos dados (o resumo cobre todo
    // arquivo que muda o desenho, como a chave das cartas do servidor; `--de-novo` monta tudo de novo)
    const tag = (h) => join(WORK, "montagens", `${h}-${dataTag}`);
    const baseDir = tag(baseHash);
    // `--ruido`: o lado novo montado de novo do zero, para medir o quanto a mesma carta varia de uma
    // montagem para outra (a rede neural na CPU pode variar uns pixels)
    const newDir = flag("--ruido") ? `${tag(newHash)}-ruido` : tag(newHash);
    if (flag("--ruido")) rmSync(newDir, { recursive: true, force: true });
    if (flag("--de-novo")) for (const d of [baseDir, newDir]) rmSync(d, { recursive: true, force: true });
    // (a pasta de cada lado guarda as faces de todas as rodadas; a comparação fica só com as desta
    // amostra, senão um `--grupo` ou `--amostra` listava as outras como "saiu da amostra")
    const prints = new Set(items.map((s) => `${s.set}|${s.number}`));
    const only = (meta) => Object.fromEntries(Object.entries(meta).filter(([, m]) => prints.has(`${m.set}|${m.number}`)));
    const baseMeta = only(await renderAll(browser, sA.url, baseDir, items));
    const newMeta = only(await renderAll(browser, sB.url, newDir, items));
    const outDir = join(WORK, "relatorio");
    const rows = await compare(browser, baseDir, newDir, baseMeta, newMeta, outDir);
    const total = Object.keys(newMeta).length;
    const changed = rows.filter((r) => r.status === "mudou").length;
    const worse = rows.filter((r) => r.status !== "mudou");
    const info = `${total} faces de ${items.length} impressões · base ${BASE} (${base.sha.slice(0, 8)}) · ${changed} mudaram · ${worse.length} com outro resultado`;
    report(rows, info, outDir);
    log(info);
    for (const r of worse) log(`  ${r.status}: ${r.nome} (${r.set} ${r.number}, face ${r.side})`);
    log(`relatório em ${join(outDir, "index.html").replace(ROOT + "/", "")}`);
  } finally {
    sA.stop();
    sB.stop();
    await browser.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
