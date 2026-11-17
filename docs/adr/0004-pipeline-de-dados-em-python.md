# 0004. Pipeline de dados diário em Python puro no GitHub Actions

- Situação: aceita (17/11/2026)

## Contexto

Os dados vêm de arquivos grandes (bulk do Scryfall em JSONL, centenas de MB) e de arquivos do Arena. Um Worker tem 128 MB de memória: não dá para processar ali.

## Decisão

`data/pipeline/build.py`, só com a biblioteca padrão do Python (sem dependências para manter), roda todo dia no GitHub Actions (`.github/workflows/dados.yml`), gera `data/out/cards.sql` e carrega no D1 com `wrangler d1 execute --remote --file`. Antes de publicar, o workflow confere se há mais de 30 mil cartas, para não estragar o banco com um download quebrado.

## Consequências

- Atualização automática, auditável nos logs do Actions, sem servidor próprio.
- O carregamento apaga e reinsere as tabelas; durante alguns segundos a busca pode responder vazio. Aceitável para um projeto gratuito; se incomodar, trocar por tabelas de preparo e renomear.
