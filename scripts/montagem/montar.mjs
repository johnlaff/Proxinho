#!/usr/bin/env node
/**
 * Montador em lote (ADR 0022): monta num Chromium, com o mesmo motor do site, as cartas que o site
 * montaria no aparelho da pessoa, e grava cada uma no servidor (ou numa pasta) com a mesma chave
 * que o site procura antes de montar (src/app/cardStore.ts).
 *
 * Roda sozinho no GitHub Actions (.github/workflows/montagem.yml), sem senha guardada: lá o
 * montador pede ao GitHub um token OIDC, que o Worker confere (worker/github.ts). À mão, com a
 * senha do montador:
 *   pnpm montagem:build && pnpm montagem:serve &      # a página do montador em :5198
 *   CARTAS_TOKEN=… node scripts/montagem/montar.mjs --enviar
 *
 * A ordem é a combinada (ADR 0022): primeiro as artes que passam pela rede neural (as lentas no
 * aparelho), depois a arte que o site escolhe sozinho das cartas mais jogadas (EDHREC), depois as
 * outras artes, até o limite do depósito (5 GB): a cota grátis do R2 é da conta inteira.
 *
 * Opções:
 *   --enviar            grava no servidor (`--api`), só as que faltam; só monta se o site no ar
 *                       for do mesmo código, apaga antes as cartas de outros códigos e para no limite
 *   --saida PASTA       grava numa pasta (e pula as que já estão lá)
 *   --enviar-pasta P    só envia ao servidor as cartas de uma pasta montada antes com --saida
 *   --api URL           de onde vêm os dados e as fontes (padrão: o site)
 *   --escolhidas        só a arte que o site escolhe sozinho de cada carta
 *   --cartas A,B        só estas cartas (oracle_id)
 *   --limite N          no máximo N faces
 *   --limite-bytes N    o depósito inteiro não passa de N bytes (padrão 5e9)
 *   --partes N          o trabalho dividido em N máquinas (padrão 1) ...
 *   --parte K           ... e esta é a K-ésima (de 1 a N); cada uma fica com 1/N do que cabe
 *   --prazo-min M       não começa carta nova depois de M minutos (padrão: sem prazo)
 *   --paginas N         montagens comuns ao mesmo tempo (padrão 3; a rede neural tem uma à parte)
 *   --apagar-velhas     só apaga do servidor as cartas de outros códigos e sai
 *   --conferir          só diz (saída do GitHub Actions) se há o que montar: o site no ar é deste
 *                       código e cabe mais no depósito; apaga antes as cartas de outros códigos
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { drawingHash } from "../codigo.ts";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const API = opt("--api", "https://proxinho.johnlaff.com").replace(/\/$/, "");
const PAGE = opt("--pagina", "http://localhost:5198/scripts/montagem/index.html");
const OUT = opt("--saida");
const SEND = flag("--enviar") || flag("--conferir") || flag("--apagar-velhas");
const TOKEN = process.env.CARTAS_TOKEN ?? "";
const LIMIT = Number(opt("--limite", "0")) || Infinity;
const LIMIT_BYTES = Number(opt("--limite-bytes", "5e9"));
const PARTS = Number(opt("--partes", "1"));
const PART = Number(opt("--parte", "1"));
const DEADLINE = Date.now() + (Number(opt("--prazo-min", "0")) || Infinity) * 60_000;
const PAGES = Number(opt("--paginas", "3"));
const BATCH = 100;
/** abaixo disto por máquina, não vale começar (o depósito está cheio) */
const MIN_BUDGET = 10e6;

/** o `audience` que o Worker aceita no token do GitHub (worker/github.ts) */
const AUDIENCE = "proxinho-montagem";

const log = (...a) => console.log(`[montagem ${new Date().toISOString().slice(11, 19)}]`, ...a);

let oidc = { token: "", at: 0 };

/**
 * A autorização: no GitHub Actions, um token OIDC do próprio GitHub (vale uns 5 minutos; pedido de
 * novo a cada 4 e quando o servidor recusa); fora dele, a senha do montador.
 */
async function auth(fresh = false) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  if (!url) return { authorization: `Bearer ${TOKEN}` };
  if (fresh || !oidc.token || Date.now() - oidc.at > 4 * 60_000) {
    const res = await fetch(`${url}&audience=${encodeURIComponent(AUDIENCE)}`, {
      headers: { authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    });
    if (!res.ok) throw new Error(`token do GitHub: ${res.status}`);
    oidc = { token: (await res.json()).value, at: Date.now() };
  }
  return { authorization: `Bearer ${oidc.token}` };
}

async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn(i > 0);
    } catch (err) {
      if (i + 1 >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

/** Um pedido autorizado ao servidor, com novas tentativas (e um token novo depois de um 401). */
async function call(method, path, body, headers = {}) {
  return retry(async (again) => {
    const res = await fetch(API + path, { method, headers: { ...(await auth(again)), ...headers }, body });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res;
  });
}

const put = (path, data, translated) => call("PUT", path, data, { "content-type": "image/jpeg", "x-traduzida": translated ? "1" : "0" });

/** O resumo do código e a chave de um caminho /api/cartas/<código>/<chave>.jpg. */
const parts = (path) => /\/api\/cartas\/([0-9a-f]{16})\/([0-9a-f]{64})\.jpg$/.exec(path);

async function missing(paths) {
  if (!paths.length) return new Set();
  if (OUT) return new Set(paths.filter((p) => !existsSync(join(OUT, p.replace("/api/cartas/", "")))));
  if (!SEND) return new Set(paths);
  const out = new Set();
  const build = parts(paths[0])[1];
  for (let i = 0; i < paths.length; i += 1000) {
    const chunk = paths.slice(i, i + 1000);
    const res = await call("POST", `/api/cartas/${build}/faltando`, JSON.stringify({ chaves: chunk.map((p) => parts(p)[2]) }), {
      "content-type": "application/json",
    });
    for (const k of (await res.json()).faltando) out.add(`/api/cartas/${build}/${k}.jpg`);
  }
  return out;
}

async function save(path, data, translated) {
  if (OUT) {
    const file = join(OUT, path.replace("/api/cartas/", ""));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
    if (!translated) writeFileSync(`${file}.em-ingles`, "");
  }
  if (SEND) await put(path, data, translated);
}

/** Envia ao servidor as cartas de uma pasta montada antes (só as que faltam lá). */
async function sendFolder(dir) {
  const files = [];
  for (const build of readdirSync(dir))
    for (const name of readdirSync(join(dir, build))) if (name.endsWith(".jpg")) files.push(`/api/cartas/${build}/${name}`);
  const wanted = await missing(files);
  log(`${files.length} cartas na pasta, ${wanted.size} faltando no servidor`);
  let n = 0;
  const queue = [...wanted];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let path; (path = queue.shift());) {
        const file = join(dir, path.replace("/api/cartas/", ""));
        await put(path, readFileSync(file), !existsSync(`${file}.em-ingles`));
        if (++n % 500 === 0) log(`${n} de ${wanted.size} enviadas`);
      }
    }),
  );
  log(`${n} enviadas`);
}

/** Os códigos com cartas no depósito e quanto ele ocupa. */
async function usage() {
  return (await call("GET", "/api/cartas")).json();
}

/** Apaga as cartas dos códigos que não são o atual (o site nunca mais as acha). */
async function dropOld(current) {
  const { codigos } = await usage();
  for (const code of codigos.filter((c) => c !== current)) {
    let total = 0;
    for (;;) {
      const r = await (await call("DELETE", `/api/cartas/${code}`)).json();
      total += r.apagadas;
      if (!r.restam) break;
    }
    log(`código ${code}: ${total} cartas apagadas`);
  }
}

/** O código do site no ar (`null` no `dev`, que não guarda cartas). */
async function liveCode() {
  const res = await retry(() =>
    fetch(`${API}/api/health`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`health: ${r.status}`)))),
  );
  return res.codigo ?? null;
}

/** Uma saída para os passos seguintes do GitHub Actions. */
function output(name, value) {
  log(`${name}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** As cartas com texto em PT, das mais jogadas às menos (EDHREC). */
async function cardIds() {
  if (opt("--cartas")) return opt("--cartas").split(",");
  return (await (await call("GET", "/api/cartas/lista")).json()).cartas;
}

async function fetchCards(ids) {
  return retry(async () => {
    const res = await fetch(`${API}/api/cards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`/api/cards: ${res.status}`);
    return (await res.json()).results;
  });
}

async function openPage(browser) {
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && log("[página]", m.text()));
  page.on("pageerror", (e) => log("[página]", e.message));
  // as fontes oficiais vêm do site (a página do montador não tem a API)
  await page.route("**/api/fontes/**", async (route) => {
    const u = new URL(route.request().url());
    const r = await fetch(API + u.pathname + u.search);
    await route.fulfill({
      status: r.status,
      body: Buffer.from(await r.arrayBuffer()),
      headers: { "content-type": r.headers.get("content-type") ?? "font/ttf" },
    });
  });
  await page.goto(PAGE);
  await page.waitForSelector("body[data-ready='1']", { state: "attached" });
  return page;
}

/**
 * As fases, na ordem combinada: a rede neural (todas as artes, ou só a escolhida), a arte que o
 * site escolhe sozinho e as outras artes.
 */
const PHASES = [
  { name: "rede neural", keep: (j) => j.neural && (j.first || !flag("--escolhidas")) },
  { name: "escolhidas", keep: (j) => !j.neural && j.first },
  ...(flag("--escolhidas") ? [] : [{ name: "outras", keep: (j) => !j.neural && !j.first }]),
];

async function main() {
  if (SEND && !TOKEN && !process.env.ACTIONS_ID_TOKEN_REQUEST_URL)
    throw new Error("Defina CARTAS_TOKEN para gravar no servidor (no GitHub Actions, o token OIDC basta).");
  if (!(PART >= 1 && PART <= PARTS)) throw new Error(`--parte ${PART} fora de 1 a ${PARTS}.`);
  if (opt("--enviar-pasta")) return sendFolder(opt("--enviar-pasta"));
  const build = drawingHash();
  log(`código ${build}`);
  let budget = Infinity;
  if (SEND) {
    // montar de outro código grava cartas que o site no ar não acha
    const live = await liveCode();
    if (live && live !== build) {
      log(`o site no ar é do código ${live}: nada a montar (publique este commit antes)`);
      if (flag("--conferir")) output("montar", "false");
      return;
    }
    // só uma máquina apaga: com várias, o passo de conferir já apagou antes de elas começarem
    if (PARTS === 1 || flag("--conferir") || flag("--apagar-velhas")) await dropOld(build);
    if (flag("--apagar-velhas")) return;
    const { bytes, objetos } = await usage();
    budget = Math.floor((LIMIT_BYTES - bytes) / PARTS);
    log(`depósito: ${(bytes / 1e9).toFixed(2)} GB em ${objetos} imagens; cabem ${(budget / 1e6).toFixed(0)} MB nesta parte`);
    if (flag("--conferir")) return output("montar", budget >= MIN_BUDGET ? "true" : "false");
    if (budget < MIN_BUDGET) return log("o depósito está no limite: nada a montar");
  }
  const { chromium } = createRequire(import.meta.url)("@playwright/test");
  const browser = await chromium.launch({
    args: ["--enable-unsafe-webgpu"],
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  });
  const planner = await openPage(browser);
  const { fonts, path } = await planner.evaluate(() => window.montagem.ready());
  if (fonts !== "o|o") throw new Error(`As fontes oficiais não carregaram (${fonts}): as chaves não seriam as do site.`);
  if (!path) throw new Error("A página foi montada sem o resumo do código (use pnpm montagem:build).");
  if (parts(path)[1] !== build)
    throw new Error(`A página é do código ${parts(path)[1]}, não deste commit (${build}): rode pnpm montagem:build.`);

  const ids = await cardIds();
  log(`${ids.length} cartas com texto em PT${PARTS > 1 ? `; parte ${PART} de ${PARTS}` : ""}`);
  // o plano inteiro primeiro: a mesma ordem em todas as partes, e cada fase passa por todas as cartas
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const planned = await planner.evaluate((r) => window.montagem.plan(r, true), await fetchCards(batch));
    await planner.evaluate(() => window.montagem.forget());
    batches.push({ ids: batch, jobs: planned });
  }
  log(`plano: ${batches.reduce((n, b) => n + b.jobs.length, 0)} faces`);

  const pages = [await openPage(browser)];
  for (let i = 1; i < PAGES; i++) pages.push(await openPage(browser));
  const neuralPage = await openPage(browser);
  const stats = { faces: 0, images: 0, bytes: 0, english: 0, skipped: 0, failed: 0 };
  const started = Date.now();
  let faces = LIMIT;
  let stop = "";

  async function runJobs(jobs, results) {
    // cada página do lote precisa das cartas
    await Promise.all([...pages, neuralPage].map((p) => p.evaluate((r) => (window.montagem.forget(), window.montagem.plan(r)), results)));
    const work = async (page, queue) => {
      for (let job; !stop && (job = queue.shift());) {
        if (Date.now() > DEADLINE) {
          stop = "prazo";
          break;
        }
        try {
          const made = await page.evaluate(([j, k]) => window.montagem.render(j, k), [job, job.todo]);
          stats.faces++;
          // sem a rede neural a carta saiu na original: fica para o aparelho da pessoa
          if (made.some((m) => m.reason === "neural" || !m.path)) {
            stats.failed++;
            continue;
          }
          const images = made.map((m) => ({ ...m, buf: Buffer.from(m.data, "base64") }));
          const size = images.reduce((n, m) => n + m.buf.length, 0);
          // a prévia e a face do PDF vão juntas, ou nenhuma: o limite do depósito nunca passa
          if (stats.bytes + size > budget) {
            stop = "limite";
            break;
          }
          stats.bytes += size;
          for (const m of images) {
            await save(m.path, m.buf, m.translated);
            stats.images++;
            stats.english += m.translated ? 0 : 1;
          }
        } catch (err) {
          stats.failed++;
          log(`falhou ${job.name} (${job.set} ${job.number}, face ${job.side}): ${err.message.split("\n")[0]}`);
        }
      }
    };
    // uma fila só para as páginas comuns (cada face uma vez) e outra para a da rede neural
    const common = jobs.filter((j) => !j.neural);
    const neural = jobs.filter((j) => j.neural);
    await Promise.all([...pages.map((p) => work(p, common)), work(neuralPage, neural)]);
  }

  for (const phase of PHASES) {
    log(`fase: ${phase.name}`);
    let turn = 0;
    for (const [n, batch] of batches.entries()) {
      if (stop || faces <= 0) break;
      // as faces da fase, em rodízio entre as partes
      const jobs = batch.jobs.filter((j) => phase.keep(j) && turn++ % PARTS === PART - 1);
      if (!jobs.length) continue;
      const wanted = await missing(jobs.flatMap((j) => j.keys.map((k) => k.path)));
      const todo = [];
      for (const j of jobs) {
        j.todo = j.keys.filter((k) => wanted.has(k.path)).map((k) => k.kind);
        if (!j.todo.length) stats.skipped++;
        else if (faces-- > 0) todo.push(j);
      }
      if (todo.length) await runJobs(todo, await fetchCards(batch.ids));
      const secs = (Date.now() - started) / 1000;
      log(
        `${phase.name}: lote ${n + 1}/${batches.length} | faces ${stats.faces} (${(stats.faces / secs).toFixed(2)}/s) | imagens ${stats.images} (${(stats.bytes / 1e6).toFixed(0)} MB) | em inglês ${stats.english} | já prontas ${stats.skipped} | falhas ${stats.failed}`,
      );
    }
  }
  await browser.close();
  if (stop === "limite") log(`parou no limite do depósito (${(budget / 1e6).toFixed(0)} MB nesta parte)`);
  if (stop === "prazo") log("parou no prazo: a próxima rodada continua de onde esta parou");
  log(`fim: ${JSON.stringify(stats)} em ${Math.round((Date.now() - started) / 60000)} min`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
