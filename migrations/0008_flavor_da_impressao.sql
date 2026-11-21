-- O flavor em PT de uma arte que não leva o da impressão do texto (`text_flavor`): o da versão do
-- Arena com o mesmo flavor em inglês, um por face (JSON). O Arena tem um flavor por versão e o
-- texto vem de uma só: Birds of Paradise da BLC 81 saía sem a fala da Ms. Bumbleflower.
ALTER TABLE prints ADD COLUMN flavor_pt TEXT;
