-- O flavor em PT é de uma impressão (cards.text_print). Outra arte da mesma carta com o
-- mesmo flavor em inglês leva o mesmo flavor em PT: 1 nas impressões em que isso vale.
-- Ver docs/adr/0011-medidas-na-imagem-e-varredura-de-erros.md.
ALTER TABLE prints ADD COLUMN text_flavor INTEGER NOT NULL DEFAULT 0;
