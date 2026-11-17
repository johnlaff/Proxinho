# Guia de operação

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Site e API | Cloudflare Worker `proxinho`, domínio `proxinho.johnlaff.com` |
| Banco | Cloudflare D1 `proxinho` |
| Atualização dos dados | GitHub Actions, workflow "Dados diários" (04h17 de Brasília) |
| Deploy | GitHub Actions, workflow "CI/CD", job "Deploy em produção" (a cada push na main) |
| Logs | Painel da Cloudflare → Workers → proxinho → Logs (observability ligada) |
| Saúde | `GET https://proxinho.johnlaff.com/api/health` → `{ ok, dataUpdatedAt }` |

## Segredos do repositório

`CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts, D1 e Workers Routes do domínio, edição) e `CLOUDFLARE_ACCOUNT_ID`, no ambiente `producao` do GitHub.

## Tarefas comuns

**Atualizar os dados agora:** GitHub → Actions → "Dados diários" → Run workflow.

**Voltar o site para a versão anterior:**
```bash
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <id-da-versao>
```

**Rodar uma migração do banco:** crie `migrations/000N_nome.sql`; o deploy aplica sozinho (`wrangler d1 migrations apply proxinho --remote`). Para testar local: `pnpm db:migrate:local`.

**Consultar o banco:**
```bash
pnpm exec wrangler d1 execute proxinho --remote --command "SELECT count(*) FROM cards"
```

## Quando algo dá errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Dados diários" falha em "Confere se o resultado é saudável" | Scryfall ou Untapped mudou formato ou ficou fora | O banco antigo continua no ar. Ver o log do passo "Gera o banco"; ajustar `build.py` |
| Cartas novas do Arena sem português | Untapped ainda não publicou o arquivo novo | Esperar o próximo ciclo; rodar o workflow manualmente |
| Prévias não carregam ("Não carregou") | CDN do Scryfall lento ou fora | Nada a fazer do nosso lado; o botão tenta de novo |
| Importar do Archidekt falha | Deck privado ou API mudou | Testar `GET /api/import?url=...`; ver `worker/importers.ts` |
| Busca vazia por alguns segundos às 04h17 | Recarga do banco (apaga e reinsere) | Esperado; ver ADR 0004 |
