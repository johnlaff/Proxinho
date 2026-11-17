# ADR 0007: Molduras de duas faces e de planeswalker

- Status: aceito
- Data: 17/11/2026

## Contexto

Até aqui o motor só reescrevia a moldura comum de 2015. As cartas de duas faces (transformar e modais) e os planeswalkers saíam em inglês, e as de duas faces saíam só com a frente. Juntas, elas somam cerca de 600 cartas de Commander com texto oficial em português.

## Decisão

**Duas faces.** Cada impressão ganha a coluna `sides` (JSON com custo, P/R, indicador de cor e suporte de cada face). A folha, a prévia e o PDF tratam cada face como um espaço: frente e verso seguidos, em cada cópia. O motor:

- desloca o nome quando há o ícone de transformar à esquerda e procura o ícone à direita nos versos sem custo (desde 2023);
- pula a bolinha do indicador de cor na linha de tipo;
- descobre se o texto original é claro ou escuro em cada faixa (`textPolarity`) e escreve na mesma cor;
- redesenha o lembrete "4/4" do verso no canto da caixa, com o texto desviando dele (`Notch` em `text.ts`);
- nas modais, para a caixa antes da faixa com o resumo do outro lado.

**Planeswalker** (`src/engine/planeswalker.ts`). A altura de cada faixa de habilidade muda de carta para carta, então é medida na imagem: os escudos de lealdade pela ponta direita (preta chapada), as divisas pela mudança de tom do fundo, e as habilidades estáticas vão para o espaço livre acima ou abaixo dos escudos. Todas as faixas usam o mesmo corpo de letra. Se a imagem não bater com o texto, a carta sai como está; o pipeline já marca como não suportados os planeswalkers cujo texto em PT tem outro número de habilidades que o inglês.

## Consequências

- +351 cartas de duas faces e +263 planeswalkers de Commander saem reescritos.
- A faixa do pé das modais ("Land", "Instant") continua em inglês.
- Molduras especiais de verso (bússola de Ixalan, templos de LCI com nome centralizado) não são tratadas de forma específica; as de Ixalan ficam marcadas como não suportadas.
- O apagamento sobre as caixas translúcidas dos planeswalkers pode deixar manchas suaves onde havia muito texto.
