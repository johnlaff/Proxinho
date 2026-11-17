# 0005. PDF gerado no navegador com pdf-lib, em milímetros

- Situação: aceita (17/11/2026)

## Contexto

O resultado precisa sair exatamente com 63 × 88 mm na impressora caseira ou na copiadora, em A4 (padrão no Brasil) ou Carta. Gerar no servidor exigiria baixar e guardar imagens de cartas.

## Decisão

`src/lib/pdf.ts` usa pdf-lib no navegador, com todas as medidas em milímetros convertidas para pontos. Grade 3 × 3 centralizada, marcas de corte fora da área das cartas e uma régua de 5 cm na margem lateral com o aviso para imprimir em tamanho real. Dois usos: "na frente da carta" (sem sangria, opção de reduzir 0,5 mm para entrar fácil no sleeve) e "carta inteira" (sangria de 2 mm na A4 e 1 mm na Carta, porque impressoras caseiras não imprimem nos últimos ~4 mm). O pdf-lib é carregado só quando a pessoa pede o PDF.

## Consequências

- Privacidade e custo: nada sai do navegador.
- Testes de unidade conferem que a grade cabe na área imprimível de cada papel.
