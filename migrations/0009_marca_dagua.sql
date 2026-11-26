-- A marca-d'água da impressão ("golgari", "mirran", "fnm"…). Na moldura de 2003 ela fica na caixa
-- e só as letras saem de cima dela (ADR 0024): o apagamento de sempre a levava só onde as letras
-- passavam, e o resto ficava em cacos.
ALTER TABLE prints ADD COLUMN watermark TEXT;
