-- Nome de crossover impresso no alto da carta (o `flavor_name` do Scryfall: "Skeletor, Lord
-- of Destruction" no Tinybones, the Pickpocket da Secret Lair). O nome de jogo fica numa
-- linha pequena logo abaixo da barra do nome, e é ela que recebe o nome em PT.
-- Ver docs/adr/0012-moldura-sem-borda.md.
ALTER TABLE prints ADD COLUMN flavor_name TEXT;
