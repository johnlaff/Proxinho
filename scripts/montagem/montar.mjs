#!/usr/bin/env node
/**
 * Montador em lote (ADR 0022): monta num Chromium, com o mesmo motor do site, as cartas que o site
 * montaria no aparelho da pessoa, e grava cada uma no servidor (ou numa pasta) com a mesma chave
 * que o site procura antes de montar (src/app/cardStore.ts).
 *
 * Uso (depois do deploy, com o mesmo commit do site):
 *   pnpm montagem:build && pnpm montagem:serve &      # a página do montador em :5198
 *   CARTAS_TOKEN=… node scripts/montagem/montar.mjs --enviar
 *
 * Opções:
 *   --enviar            grava no servidor (`--api`), só as que faltam; pede CARTAS_TOKEN
 *   --saida PASTA       grava numa pasta (e pula as que já estão lá)
 *   --enviar-pasta P    só envia ao servidor as cartas de uma pasta montada antes com --saida
 *   --api URL           de onde vêm os dados e as fontes (padrão: o site)
 *   --local             a lista de cartas vem do D1 local, não do remoto
 *   --escolhidas        só a arte que o site escolhe sozinho de cada carta
 *   --cartas A,B        só estas cartas (oracle_id)
 *   --limite N          no máximo N faces
 *   --paginas N         montagens comuns ao mesmo tempo (padrão 3; a rede neural tem uma à parte)
 *   --apagar-velhas     apaga do servidor as cartas de outros códigos e sai
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const API = opt("--api", "https://proxinho.johnlaff.com").replace(/\/$/, "");
const PAGE = opt("--pagina", "http://localhost:5198/scripts/montagem/index.html");
const OUT = opt("--saida");
const SEND = flag("--enviar");
const TOKEN = process.env.CARTAS_TOKEN ?? "";
const LIMIT = Number(opt("--limite", "0")) || Infinity;
const PAGES = Number(opt("--paginas", "3"));
const BATCH = 100;

const log = (...a) => console.log(`[montagem ${new Date().toISOString().slice(11, 19)}]`, ...a);
const auth = { authorization: `Bearer ${TOKEN}` };

async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i + 1 >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

async function put(path, data, translated) {
  await retry(async () => {
    const res = await fetch(API + path, {
      method: "PUT",
      headers: { ...auth, "content-type": "image/jpeg", "x-traduzida": translated ? "1" : "0" },
      body: data,
    });
    if (!res.ok) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
  });
}

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
    const res = await retry(async () => {
      const r = await fetch(`${API}/api/cartas/${build}/faltando`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ chaves: chunk.map((p) => parts(p)[2]) }),
      });
      if (!r.ok) throw new Error(`faltando: ${r.status} ${await r.text()}`);
      return r.json();
    });
    for (const k of res.faltando) out.add(`/api/cartas/${build}/${k}.jpg`);
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

async function dropOld(current) {
  const res = await fetch(`${API}/api/cartas`, { headers: auth });
  if (!res.ok) throw new Error(`lista: ${res.status} ${await res.text()}`);
  const { codigos } = await res.json();
  for (const code of codigos.filter((c) => c !== current)) {
    let total = 0;
    for (;;) {
      const r = await (await fetch(`${API}/api/cartas/${code}`, { method: "DELETE", headers: auth })).json();
      total += r.apagadas;
      if (!r.restam) break;
    }
    log(`código ${code}: ${total} cartas apagadas`);
  }
}

/** As cartas com texto em PT, das mais jogadas às menos (EDHREC), do D1 remoto ou local. */
function cardIds() {
  if (opt("--cartas")) return opt("--cartas").split(",");
  const sql =
    "SELECT oracle_id FROM cards WHERE source IS NOT NULL AND name_pt IS NOT NULL ORDER BY edhrec_rank IS NULL, edhrec_rank, layout = 'token'";
  const out = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "proxinho", flag("--local") ? "--local" : "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(out)[0].results.map((r) => r.oracle_id);
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

async function main() {
  if (SEND && !TOKEN) throw new Error("Defina CARTAS_TOKEN para gravar no servidor.");
  if (opt("--enviar-pasta")) return sendFolder(opt("--enviar-pasta"));
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu"] });
  const planner = await openPage(browser);
  const { fonts, path } = await planner.evaluate(() => window.montagem.ready());
  if (fonts !== "o|o") throw new Error(`As fontes oficiais não carregaram (${fonts}): as chaves não seriam as do site.`);
  if (!path) throw new Error("A página foi montada sem o resumo do código (use pnpm montagem:build).");
  const build = parts(path)[1];
  log(`código ${build}`);
  if (flag("--apagar-velhas")) {
    await dropOld(build);
    return browser.close();
  }
  const ids = cardIds();
  log(`${ids.length} cartas com texto em PT`);
  const pages = [await openPage(browser)];
  for (let i = 1; i < PAGES; i++) pages.push(await openPage(browser));
  const neuralPage = await openPage(browser);
  const stats = { faces: 0, images: 0, english: 0, skipped: 0, failed: 0, ms: 0 };
  const started = Date.now();
  let budget = LIMIT;

  async function runJobs(jobs, results) {
    // cada página do lote precisa das cartas
    await Promise.all([...pages, neuralPage].map((p) => p.evaluate((r) => (window.montagem.forget(), window.montagem.plan(r)), results)));
    const common = jobs.filter((j) => !j.neural);
    const neural = jobs.filter((j) => j.neural);
    const work = async (page, queue) => {
      for (let job; (job = queue.shift());) {
        try {
          const made = await page.evaluate(([j, k]) => window.montagem.render(j, k), [job, job.todo]);
          stats.faces++;
          for (const m of made) {
            // sem a rede neural a carta saiu na original: fica para o aparelho da pessoa
            if (m.reason === "neural" || !m.path) {
              stats.failed++;
              continue;
            }
            await save(m.path, Buffer.from(m.data, "base64"), m.translated);
            stats.images++;
            stats.english += m.translated ? 0 : 1;
            stats.ms += m.ms;
          }
        } catch (err) {
          stats.failed++;
          log(`falhou ${job.name} (${job.set} ${job.number}, face ${job.side}): ${err.message.split("\n")[0]}`);
        }
      }
    };
    await Promise.all([...pages.map((p) => work(p, common)), work(neuralPage, neural)]);
  }

  for (const phase of flag("--escolhidas") ? ["escolhidas"] : ["escolhidas", "outras"]) {
    log(`fase: ${phase}`);
    for (let i = 0; i < ids.length && budget > 0; i += BATCH) {
      const results = await fetchCards(ids.slice(i, i + BATCH));
      const planned = await planner.evaluate(([r, every]) => window.montagem.plan(r, every), [results, phase === "outras"]);
      await planner.evaluate(() => window.montagem.forget());
      const jobs = planned.filter((j) => (phase === "escolhidas") === j.first);
      const wanted = await missing(jobs.flatMap((j) => j.keys.map((k) => k.path)));
      const todo = [];
      for (const j of jobs) {
        j.todo = j.keys.filter((k) => wanted.has(k.path)).map((k) => k.kind);
        if (!j.todo.length) stats.skipped++;
        else if (budget-- > 0) todo.push(j);
      }
      if (todo.length) await runJobs(todo, results);
      const secs = (Date.now() - started) / 1000;
      log(
        `${phase}: cartas ${Math.min(i + BATCH, ids.length)}/${ids.length} | faces ${stats.faces} (${(stats.faces / secs).toFixed(2)}/s) | imagens ${stats.images} | em inglês ${stats.english} | já prontas ${stats.skipped} | falhas ${stats.failed}`,
      );
    }
  }
  await browser.close();
  log(`fim: ${JSON.stringify(stats)} em ${Math.round((Date.now() - started) / 60000)} min`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
