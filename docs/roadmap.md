# Roadmap

## Próximos passos (o agente pode fazer)

- Molduras: saga, aventura, showcase, naves com "Estacionar" (Station) e promos de Game Day com a arte atrás da caixa de texto. (Duas faces e planeswalker: feito em 17/11/2026, ver ADR 0007. Caixa dos planeswalkers sem mancha, com o LaMa: feito em 17/11/2026, ver ADR 0008. Sem borda, na moldura padrão: feito em 19/11/2026, ver ADR 0012.)
- Sem borda, o que ficou de fora: as molduras próprias (sem o efeito `inverted`: Invocações de Amonkhet, Mythic Edition, várias da Secret Lair), a série Drácula de VOW (barra de tipo mais baixa e caixa curta), as de caixa clara, as de retícula grossa, os planeswalkers e as de duas faces sem borda.
- Acabamento mais rápido nos celulares sem WebGPU (o Firefox do Android ainda não tem; o Chrome do Android libera a placa de vídeo só em parte dos aparelhos, e a gaveta já diz o motivo de cada um). A conferir: o modo de compatibilidade do WebGPU (`featureLevel: "compatibility"`), que abre a placa de vídeo em aparelhos mais antigos, se o LaMa roda nele. O MI-GAN foi testado em 19/11/2026 nos quadros reais de 6 artes sem borda: 11 vezes mais rápido, mas com manchas e sombra das letras, reprovado para o acabamento; só serviria para um rascunho melhor. O preparo já caiu de 10,4 s para 3,2 s (lote fixo em 1, ADR 0013). Medida e pronta para fazer: a caixa da sem borda num quadro só (30% mais rápida, falta a regressão). (PDF montado em segundo plano e cartas guardadas no navegador: feito em 19/11/2026, ver ADR 0014.) Ver "Velocidade do acabamento e do deck inteiro" em `docs/pesquisa.md`. (Placa de vídeo de verdade, download compactado e prévia em duas etapas: feito em 19/11/2026, ver ADR 0013.)
- Montar as cartas numa worker (OffscreenCanvas), para o PDF usar todos os núcleos e a página não prender meio segundo por carta enquanto o PDF é adiantado. O motor depende do canvas da página e de `document.fonts`.
- Pesquisa: uma rede pequena treinada para imitar o LaMa nas caixas de carta (destilação, como o MI-GAN foi feito), para o acabamento ficar rápido também na CPU. Pede semanas de treino em placa de vídeo.
- Cartas modais: traduzir a faixa do pé da carta com o resumo do outro lado (hoje continua em inglês).
- Planeswalkers lotados (Will e Rowan Kenrith, CLB): o texto em PT é mais longo e a faixa mais apertada encolhe a letra de todas. Deixar a faixa de lealdade avançar no espaço vazio do bloco de baixo.
- Edição manual do texto antes de imprimir.
- Emblemas na moldura de 2003 e as cartas de apoio (Monarca, Iniciativa, masmorras). (Fichas, emblemas, fichas de duas faces e fichas de 2003: feito em 17/11/2026, ver ADRs 0009 e 0010.)
- Exportar PNGs avulsos.
- Tabela de correções de texto do Arena (ex.: Lunar Convocation) e botão "reportar tradução".
- PWA para funcionar offline depois da primeira visita.

## Precisa de decisão do João

- Pedir autorização à Untapped para o uso dos arquivos do Arena e avisar o Scryfall antes de divulgar.
- Tradução não oficial assistida pelo glossário do Arena para as ~2.400 cartas sem texto oficial (marcada como não oficial).
- Pedir acesso oficial à API do Moxfield.
- Doação opcional (permitida pela política de conteúdo de fãs, desde que não bloqueie o acesso).
