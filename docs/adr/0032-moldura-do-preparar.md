# ADR 0032: moldura do Preparar

- Status: aceito
- Data: 25/11/2026
- Complementa: ADR 0017 (Aventura) e ADR 0011 (medidas na imagem)

## Contexto

Secrets of Strixhaven (abril de 2026) trouxe o Preparar: a criatura tem uma mágica ligada, que pode ser conjurada como cópia enquanto ela está "preparada". As notas de lançamento descrevem a carta como "um conjunto de características alternativas para a mágica numa moldura menor, do lado direito da caixa de texto". O Reality Fracture (FRA) e o Commander de SOS (SOC) repetem o desenho; o Scryfall chama o layout de `prepare`. São 120 impressões em inglês no papel, 67 cartas com texto em PT, e todas saíam na imagem em inglês.

O desenho é a Aventura de lado trocado, sem o livro: a caixa de texto é dividida ao meio por um fio da cor da moldura (x ≈ 366 a 377, o mais escuro em 371 a 373). À esquerda vêm as regras e o flavor da criatura, num papel só, até a moldura do pé (y ≈ 956 a 964). À direita, a barra do nome da mágica (y ≈ 657 a 699, letra branca, custo acabando em x ≈ 690), a barra do tipo (y ≈ 701 a 750, com a ponta direita redonda) e uma caixa menor, de papel mais escuro, entre um bisel claro abaixo da barra do tipo (o papel começa em 760 a 762) e o bisel acima da caixa de P/R (919 a 922). A caixa de P/R fica embaixo da caixa da mágica, à direita.

O Arena traz a criatura e a mágica como duas faces (`faces[0]` e `faces[1]`), como na Aventura. Nenhuma ferramenta de proxy conhecida tem modelo para o Preparar; o Proxyshop tem o da Aventura (`AdventureMod`), com camadas próprias para o nome, o custo, o tipo e as regras da outra metade.

## Decisão

**Pipeline.** `prepare_supported`: `frame` 2015, layout `prepare`, borda preta, efeitos de lendária, encantamento e arte estendida (a arte estendida tem a mesma caixa: Joined Researchers, SOS 312), sem `full_art` e com as duas faces. Ficam de fora a Ancestral Recall de SOS na moldura de 2003 (SOS 306) e a Bloodline Recollector de arte inteira (FRA 402). `renderInput` manda a segunda face ao motor, como na Aventura.

**Motor** (`src/engine/prepare.ts`, e o caminho da Aventura em `render.ts`). As duas molduras divididas têm a mesma forma (`SplitLayout`, em `adventure.ts`): as barras do nome e do tipo da mágica, a caixa da mágica (`spell`) e a da criatura (`creature`), com o limiar das barras, o corpo máximo e o pé abaixo do qual só sai o que se liga às letras. A Aventura passou a devolver essa forma; o resto do caminho (apagar as barras linha a linha com o limiar 20, encaixar cada caixa até o corpo 30, escrever o nome e o tipo da mágica em letra clara na altura medida do inglês) é o mesmo.

- **Conferido na imagem** (`prepareFrame`): o fio, uma coluna entre x 360 e 384 mais escura que o papel dos dois lados em 70% das linhas, e as barras da mágica, 35 tons ou mais abaixo do papel da caixa dela. Sem as duas pistas, a carta sai na original.
- **A caixa da mágica** vai da primeira linha com 60% ou mais dos pixels no tom do papel dela (o bisel claro passa do tom do papel) à primeira de duas com menos de 20%. Pela mediana da linha, como na Aventura, uma linha de texto no pé da caixa passava pelo fim dela e a última linha em inglês ficava (Omit Variables, FRA 156): uma linha de texto nunca toma 80% da largura.
- **A página da criatura** vai da caixa comum da M15 até 4 px antes da coluna mais escura do fio, e até a primeira de três linhas seguidas com menos de 20% dos pixels no tom do papel. Pela mediana, o pé de uma última linha baixa passava pela moldura em nove impressões e o "becomes prepared." ficava embaixo do português (Emeritus of Ideation, SOS 45). Sem a caixa de P/R desse lado, o texto da criatura desce até o pé da caixa comum sem P/R (944).
- A barra do tipo da mágica é apagada a partir de y = 706: logo abaixo do fio de baixo da barra do nome há uma linha escura (701 a 705) que, apagada com a barra, virava um risco claro no alto do tipo em PT (Estrofe Heroica, SOS 170; Restore Relic, SOC 49).
- O custo da mágica conta os híbridos maiores (`prepareCostLeft`, ~31,5 px por símbolo e ~35,5 nos híbridos, como na Aventura). O nome encolhe até não encostar nele.
- Sem a sombra de lombada: as páginas não escurecem (`shaded: false`).

## Regressão

As 118 impressões do Preparar com texto em PT, montadas com o código desta árvore e conferidas em folhas de contato, lado a lado com a original: as 117 que o banco tem saem em português (a 118ª é uma carta de evento, sem texto em PT). Das conferências saíram as duas correções de pé de caixa acima. A regressão de sempre (ADR 0027) ganha o grupo "preparar", que só entra com os dados novos no banco.

## Consequências

- As cartas com Preparar com texto em PT (oficial ou não oficial) saem reescritas em qualquer arte da moldura comum e da arte estendida.
- A Aventura e o Preparar dividem o mesmo caminho no motor: uma terceira caixa dividida entra com uma função que devolve a `SplitLayout`.
