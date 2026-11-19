-- Indicador de cor das cartas de uma face só (o círculo colorido à esquerda da linha de
-- tipo: Crashing Footfalls, Living End, Ancestral Vision, os Pacts). Nas de duas faces ele
-- já vem em `sides`. O português do tipo começa depois dele. Ver docs/arquitetura.md.
ALTER TABLE prints ADD COLUMN indicator INTEGER NOT NULL DEFAULT 0;
