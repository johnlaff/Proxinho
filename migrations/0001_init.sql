-- Índice de cartas com texto em português.
-- Gerado diariamente por data/pipeline/build.py (veja docs/arquitetura.md).
CREATE TABLE IF NOT EXISTS cards (
  oracle_id   TEXT PRIMARY KEY,        -- identificador da carta no Scryfall (igual em todas as impressões)
  name_en     TEXT NOT NULL,           -- nome oficial em inglês
  name_pt     TEXT,                    -- nome em português (impresso ou do Arena)
  search_en   TEXT NOT NULL,           -- nome em inglês normalizado para busca
  search_pt   TEXT,                    -- nomes em português normalizados para busca
  source      TEXT,                    -- 'arena' | 'impresso' | NULL (sem tradução oficial)
  text_print  TEXT,                    -- JSON {set, number}: impressão de onde veio o texto
  faces       TEXT NOT NULL,           -- JSON: lista de faces com nome, tipo e texto em PT
  pt_print    TEXT,                    -- JSON: impressão em português mais recente (para imagem oficial)
  layout      TEXT,
  type_line   TEXT,
  edhrec_rank INTEGER,
  commander   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cards_search_en ON cards (search_en);
CREATE INDEX IF NOT EXISTS cards_search_pt ON cards (search_pt);
CREATE INDEX IF NOT EXISTS cards_rank ON cards (edhrec_rank);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
