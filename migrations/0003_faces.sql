-- Cartas de duas faces: o que o motor precisa saber de cada face da impressão.
-- JSON: [{mana_cost, has_pt, pt, indicator, supported}, …] (NULL em cartas de uma face).
ALTER TABLE prints ADD COLUMN sides TEXT;
