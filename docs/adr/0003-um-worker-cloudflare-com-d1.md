# 0003. Um único Cloudflare Worker com D1

- Situação: aceita (17/11/2026)

## Contexto

O dono do projeto já paga o plano Workers Paid (US$ 5/mês) e tem o domínio johnlaff.com na Cloudflare. O site precisa de: arquivos estáticos, busca por nome (inglês e português, sem acento), resolver listas de até centenas de cartas e importar decks por URL (Archidekt libera a API só para localhost por CORS, então precisa de um servidor no meio).

## Decisão

Um único Worker serve o site (Workers Static Assets) e a API em `/api/*` (`run_worker_first`). Os dados ficam no D1 (SQLite): tabela `cards` (texto PT, apelidos normalizados para busca) e `prints` (impressões em inglês com a marcação de moldura suportada). Importações por URL ficam 15 minutos no Cache API. O domínio é `proxinho.johnlaff.com` (custom domain do Worker).

Alternativas descartadas: Pages + Functions (a Cloudflare recomenda Workers para projetos novos); índice estático em JSON no cliente (o índice com impressões passa de 60 MB); R2 (não estava ativado e não é necessário).

## Consequências

- Um deploy, um runtime (workerd) igual no desenvolvimento (via `@cloudflare/vite-plugin`) e em produção.
- O importador só fala com hosts da lista (Archidekt, Moxfield): o Worker não vira proxy aberto.
- Custo marginal zero dentro do plano atual.
