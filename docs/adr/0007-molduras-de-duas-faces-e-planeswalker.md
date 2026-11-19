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

**Planeswalker** (`src/engine/planeswalker.ts`). A altura de cada faixa de habilidade muda de carta para carta, então é medida na imagem, assim como a moldura (caixa alta, com a linha de tipo mais acima, ou normal; ADR 0011): os escudos de lealdade pela ponta direita (preta chapada), as divisas pela mudança de tom do fundo, fora das linhas do texto em inglês, e as habilidades estáticas seguidas dividem uma faixa no espaço livre acima ou abaixo dos escudos, do lado em que aparecem no texto (ADR 0011). Todas as faixas usam o mesmo corpo de letra, e o texto de cada habilidade de lealdade fica centrado no escudo dela, sem sair da faixa (`alignOnIcon`): a última faixa vai até o pé da caixa, e o texto curto dela, centrado na faixa, ficava abaixo do escudo (Liliana, −7). A última faixa também apaga até o fio de baixo da caixa, medido na imagem (`measureBoxBottom`), mas abaixo da medida padrão só o que se liga às letras de cima (`keepAttachedBelow`): a vírgula da última linha em inglês descia até o fio e ficava (Grão-mestre das Flores, AFR), e o canto arredondado da moldura, que só aparece ali embaixo, não pode ser apagado. Se a imagem não bater com o texto, a carta sai como está; o pipeline já marca como não suportados os planeswalkers cujo texto em PT tem outro número de habilidades que o inglês.

## Consequências

- +351 cartas de duas faces e +263 planeswalkers de Commander saem reescritos.
- A faixa do pé das modais ("Land", "Instant") continua em inglês.
- Molduras especiais de verso (bússola de Ixalan, templos de LCI com nome centralizado) não são tratadas de forma específica; as de Ixalan ficam marcadas como não suportadas.
- O apagamento sobre as caixas translúcidas dos planeswalkers deixava manchas suaves; resolvido com o preenchimento por rede neural (ADR 0008).
