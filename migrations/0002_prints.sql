-- Impressões em inglês de cada carta (todas as artes disponíveis).
-- A imagem vem do CDN do Scryfall, montada a partir do id:
-- https://cards.scryfall.io/png/front/{id[0]}/{id[1]}/{id}.png
CREATE TABLE IF NOT EXISTS prints (
  id         TEXT PRIMARY KEY,     -- id da impressão no Scryfall
  oracle_id  TEXT NOT NULL,        -- carta a que pertence (cards.oracle_id)
  set_code   TEXT NOT NULL,
  set_name   TEXT NOT NULL,
  number     TEXT NOT NULL,        -- número de colecionador
  released   TEXT,
  artist     TEXT,
  frame      TEXT,                 -- '1993' | '1997' | '2003' | '2015' | 'future'
  effects    TEXT,                 -- efeitos de moldura separados por vírgula
  border     TEXT,
  layout     TEXT,
  highres    INTEGER NOT NULL DEFAULT 0,
  promo      INTEGER NOT NULL DEFAULT 0,
  mana_cost  TEXT,
  has_pt     INTEGER NOT NULL DEFAULT 0,  -- tem poder/resistência (caixa no canto)
  two_sided  INTEGER NOT NULL DEFAULT 0,
  supported  INTEGER NOT NULL DEFAULT 0   -- o motor sabe reescrever esta moldura
);
CREATE INDEX IF NOT EXISTS prints_oracle ON prints (oracle_id, released DESC);
CREATE INDEX IF NOT EXISTS prints_set_number ON prints (set_code, number);
