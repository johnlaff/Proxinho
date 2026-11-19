---
name: Proxinho
description: Proxies com o texto oficial em português, revisados numa prova de gráfica antes de imprimir.
colors:
  process-cyan: "#0086c9"
  process-magenta: "#c2186b"
  process-yellow: "#ffd400"
  process-black: "#111418"
  cyan-ink: "#005b8a"
  cyan-ink-deep: "#00466b"
  cyan-wash: "#e2f3fb"
  cyan-ink-text: "#003b5c"
  magenta-ink: "#c2186b"
  magenta-wash: "#fbe6f0"
  magenta-deep: "#7d0041"
  offset-paper: "#f4f6f8"
  paper-shade: "#e4e9ee"
  sheet-white: "#ffffff"
  ink: "#111418"
  ink-2: "#3a4450"
  ink-3: "#56616d"
  placeholder: "#6a7581"
  rule: "#c5ced7"
  slot: "#e6eaee"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 1.6vw, 2.375rem)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1vw, 2rem)"
    fontWeight: 800
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 750
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 100"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
    fontVariation: "'wdth' 86"
  tag:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 80"
  caption:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(0.6875rem, 1.3vw, 0.8125rem)"
    fontWeight: 600
    letterSpacing: "0.02em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 62"
  wordmark:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 118"
rounded:
  tag: "3px"
  option: "4px"
  base: "6px"
  art: "8px"
  card: "4.6% / 3.3%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "48px"
  gutter: "clamp(16px, 3vw, 32px)"
components:
  button-primary:
    backgroundColor: "{colors.cyan-ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.base}"
    padding: "10px 20px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.cyan-ink-deep}"
  button-primary-wide:
    backgroundColor: "{colors.cyan-ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.base}"
    height: "54px"
    width: "100%"
  button-quiet:
    textColor: "{colors.cyan-ink}"
    padding: "10px 4px"
  button-danger:
    textColor: "{colors.magenta-ink}"
    rounded: "{rounded.base}"
    padding: "6px 12px"
  button-danger-hover:
    backgroundColor: "{colors.magenta-wash}"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "11px 13px"
  tab:
    textColor: "{colors.ink-2}"
    height: "46px"
  tab-selected:
    backgroundColor: "{colors.process-black}"
    textColor: "{colors.sheet-white}"
  segmented-option-selected:
    backgroundColor: "{colors.process-black}"
    textColor: "{colors.sheet-white}"
    height: "44px"
  tag-reescrita:
    backgroundColor: "{colors.cyan-ink}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "2px 7px"
  tag-sem-traducao:
    backgroundColor: "{colors.magenta-ink}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "2px 7px"
  masthead:
    backgroundColor: "{colors.process-cyan}"
    textColor: "{colors.process-black}"
    height: "56px"
  proof-sheet:
    backgroundColor: "{colors.sheet-white}"
    width: "720px"
  message-error:
    backgroundColor: "{colors.magenta-wash}"
    textColor: "{colors.magenta-deep}"
    rounded: "{rounded.base}"
    padding: "11px 14px"
  message-ok:
    backgroundColor: "{colors.cyan-wash}"
    textColor: "{colors.cyan-ink-text}"
    rounded: "{rounded.base}"
    padding: "11px 14px"
---

# Design System: Proxinho

## Overview

**Creative North Star: "A Prova de Gráfica"**

A tela é a prova que a gráfica rápida entrega antes de rodar o trabalho. O que a pessoa revisa é a folha que vai imprimir: cartas já montadas em folhas 3×3, sobre papel offset branco-azulado, com marcas de corte, marcas de registro, tira de controle de cor CMYK, régua de 5 cm e uma linha técnica no rodapé. Todo o vocabulário visual vem desse balcão: tinta de processo, papel, legenda condensada, ordem de serviço.

A casca é sóbria e funcional. Uma faixa ciano de processo no topo, uma coluna de "ordem de serviço" à esquerda (abas, campo grande, botão ciano escuro, acabamento) e a prova à direita, com folhas brancas que flutuam pouco acima do papel. A densidade é de ferramenta de trabalho: texto em tinta preta, filetes pretos de 2 px separando blocos, cor só onde ela tem papel de gráfica (ciano para agir, magenta para avisar, amarelo para marcar).

Uma família só, Archivo variável, faz todo o trabalho variando a largura: larga e pesada no nome e nos títulos, condensada nos rótulos técnicos e legendas, com números tabulares.

**Key Characteristics:**
- Papel offset frio com folhas brancas puras; a folha é o objeto principal da tela.
- Quatro tintas de processo com papéis fixos; nada de gradiente decorativo.
- Archivo em larguras de 62% a 118%, nunca uma segunda família.
- Marcas de impressão (registro, corte, tira de cor, régua) desenhadas em SVG e CSS.
- Filetes pretos de 2 px como estrutura, em vez de cartões e sombras.
- Toda informação de cor acompanhada de texto (etiquetas curtas "PT", "EN").

## Colors

Tintas de processo sobre papel offset: ciano comprometido com a ação, magenta reservado ao aviso, amarelo como marca-texto, preto para o texto.

### Primary
- **Ciano de Processo** (process-cyan): a faixa do cabeçalho, a borda superior de 6 px da gaveta, o favicon e o `theme-color`. É a cor da casca, usada em grandes áreas com texto preto por cima.
- **Ciano Escuro de Texto** (cyan-ink): botões principais, links, estado selecionado das artes, caixa de seleção, barra de progresso e a etiqueta "Reescrita em português". Existe porque o ciano de processo não tem contraste AA com texto branco. Passa a **Ciano Profundo** (cyan-ink-deep) no hover do botão principal.
- **Ciano Lavado** (cyan-wash) com texto **Ciano Noturno** (cyan-ink-text): fundo da mensagem de sucesso e da arte escolhida na gaveta.

### Secondary
- **Magenta de Processo** (process-magenta / magenta-ink, mesmo valor): avisos de tradução. Etiqueta "EN" (sem tradução), contorno da etiqueta de moldura não suportada, borda tracejada da lista de nomes não encontrados, botão de remover, cursor de digitação.
- **Magenta Lavado** (magenta-wash) com texto **Magenta Profundo** (magenta-deep): mensagens de erro, hover do botão de remover, texto de erro dentro de uma posição da folha.

### Tertiary
- **Amarelo de Processo** (process-yellow): marca-texto. Seleção de texto, opção ativa da busca, halo de foco em campos e cartas, link de pular para o conteúdo, etiqueta "Exemplo" nas cartas de demonstração. Sempre com texto preto.

### Neutral
- **Papel Offset** (offset-paper): fundo da página e da barra fixa da prova.
- **Papel Sombreado** (paper-shade): hover de abas e botões de ícone, trilho da barra de progresso.
- **Folha Branca** (sheet-white): folhas de prova, campos, gaveta, trilhos segmentados.
- **Tinta Preta** (ink / process-black): texto principal, filetes estruturais de 2 px, aba e opção selecionadas, contorno de foco.
- **Tinta 2** (ink-2): texto de apoio, parágrafos explicativos, abas em repouso.
- **Tinta 3** (ink-3): legendas, dicas, rótulos da folha, marcas de corte e registro, borda dos campos em repouso.
- **Placeholder** (placeholder): texto de exemplo dentro dos campos.
- **Filete** (rule): divisórias finas de 1 px em listas e no rodapé de seções.
- **Espaço de Carta** (slot): fundo da carta enquanto a prévia carrega.

### Named Rules
**The Tinta Tem Função Rule.** Cada tinta de processo tem um único papel: ciano age, magenta avisa, amarelo marca, preto escreve. Magenta nunca vira botão principal; amarelo nunca carrega texto branco.

**The Ciano Escuro Rule.** Texto branco sobre ciano usa sempre o ciano escuro de texto, nunca o ciano de processo. O ciano de processo só recebe texto preto.

## Typography

**Display Font:** Archivo Variable (com Archivo, system-ui, sans-serif)
**Body Font:** Archivo Variable
**Label Font:** Archivo Variable, condensada pelo eixo de largura

**Character:** Uma grotesca de gráfica que muda de largura conforme a função: esticada e pesada quando nomeia, estreita e técnica quando legenda. A variação de largura substitui a segunda família.

### Hierarchy
- **Wordmark** (800, 1.375rem, largura 118%): só o nome Proxinho no cabeçalho, ao lado da marca de registro.
- **Display** (800, clamp de 1.75rem a 2.375rem, entrelinha 1.06, largura 112%): o título da página, com `text-wrap: balance`.
- **Headline** (800, clamp de 1.5rem a 2rem, largura 112%): título de seção de página ("Como funciona"). O título da gaveta usa 1.5rem com largura 108%.
- **Title** (750, 1.0625rem, largura 100%): títulos de bloco (resumo do pedido, acabamento, artes, colunas explicativas).
- **Body** (400, 1rem, entrelinha 1.5): texto corrido e campos; parágrafos explicativos limitados a 44ch a 62ch. O parágrafo de abertura sobe para 1.0625rem.
- **Label** (650, 0.875rem, largura 86%): rótulos de campo e de grupo. Abas e opções segmentadas usam 600, 0.9375rem, largura de 84% a 86%.
- **Tag** (700, 0.75rem, largura 80%): etiquetas de resultado.
- **Caption** (600, 0.6875rem a 0.8125rem, largura 62% a 75%, tabular, espaçamento 0.02em): legenda técnica sob cada carta (coleção e número · origem do texto · artista), rótulo "Folha 1/1", linha de rodapé da folha, régua.

### Named Rules
**The Uma Família Rule.** Archivo variável em tudo. Hierarquia vem de peso e largura (62% a 118%), nunca de uma segunda fonte.

**The Número Tabular Rule.** Contagens, quantidades, legendas de folha e listas de deck usam algarismos tabulares.

## Layout

A página é uma bancada em grade de duas colunas, com largura máxima de 1440px e respiro lateral fluido (gutter, de 16px a 32px). À esquerda, a ordem de serviço com 330px a 420px; à direita, a prova ocupando o resto, com folhas de até 720px centralizadas. O intervalo entre colunas vai de 24px a 56px. O resumo e o acabamento descem sob a ordem de serviço, ao lado da prova.

Abaixo de 900px a grade vira uma coluna: ordem de serviço, depois a prova, depois resumo e acabamento. Abaixo de 520px o primeiro link do cabeçalho some, a gaveta aperta a prévia para 132px e a grade de artes fica em duas colunas.

A folha de prova é sempre uma grade 3×3 de cartas na proporção 63:88, com intervalos proporcionais à largura da folha. A régua tem 23,8% da largura da folha: 5 cm numa folha de 21 cm, na mesma escala da prévia. A barra da prova fica fixa no topo enquanto as folhas rolam.

O ritmo de espaçamento usa 8, 12, 16, 24 e 48px; os blocos da coluna esquerda são separados por filetes pretos de 2px com 24px de respiro acima do conteúdo.

## Elevation & Depth

O sistema é plano, com uma exceção física: a folha de prova. A estrutura vem de filetes pretos e de papel contra folha, não de cartões flutuantes. Sombras aparecem só onde há um objeto que de fato se sobrepõe: a folha sobre o papel, a gaveta sobre a página, a lista da busca, a carta que levanta no hover.

### Shadow Vocabulary
- **Folha** (`box-shadow: 0 1px 2px rgb(17 20 24 / 0.08), 0 8px 24px -8px rgb(17 20 24 / 0.18)`): cada folha de prova sobre o papel offset.
- **Carta levantada** (`box-shadow: 0 10px 20px -10px rgb(17 20 24 / 0.5)`, com `translateY(-3px)`): hover de uma carta clicável na folha.
- **Lista suspensa** (`box-shadow: 0 10px 28px -10px rgb(17 20 24 / 0.35)`): resultados da busca de cartas.
- **Gaveta** (`box-shadow: -12px 0 40px -12px rgb(17 20 24 / 0.4)`, fundo `rgb(17 20 24 / 0.5)`): a gaveta lateral "Trocar arte".
- **Etiqueta colada** (`box-shadow: 0 1px 3px rgb(17 20 24 / 0.3)`): etiqueta de resultado presa na borda da carta.

### Named Rules
**The Só a Folha Flutua Rule.** Painéis, seções e grupos da casca não ganham sombra nem fundo de cartão; eles se separam por filetes. Sombra é reservada a objetos físicos (folha, gaveta, lista, carta).

## Shapes

Cantos discretos e retos de trabalho: 6px em botões, campos, abas (só em cima), trilhos segmentados e mensagens; 3px nas etiquetas e amostras de legenda; 4px nas opções da busca; 8px no cartão de arte da gaveta. A carta usa o canto proporcional `4.6% / 3.3%`, que reproduz o arredondado real da carta em qualquer escala. A folha de prova tem cantos retos, como papel.

Contornos são de 1.5px em tinta preta ou tinta 3 (campos, trilhos, contador, lista suspensa) e de 2.5px para seleção de arte. Posições vazias da folha são tracejadas com hachura diagonal fina. Marcas de corte em L ficam 7px fora de cada carta (5px no celular); marcas de registro de 14px ficam no meio das quatro margens da folha.

## Components

### Buttons
Diretos e táteis, com descida de 1px ao pressionar.
- **Shape:** cantos discretos (6px), altura mínima de 46px.
- **Primary:** ciano escuro com texto branco, peso 700, largura 96%, padding de 10px 20px. Versão larga ocupa toda a coluna com 54px de altura para "Baixar PDF"; versão pequena tem 40px na barra da prova.
- **Hover / Focus:** escurece para o ciano profundo; foco global é contorno preto de 3px com 2px de afastamento.
- **Quiet:** texto ciano escuro sublinhado, sem fundo; sublinhado engrossa de 1px para 2px no hover.
- **Danger:** contorno de 1.5px em magenta, sem fundo; magenta lavado no hover. Só para remover.
- **Ícone:** 44×44px, transparente, papel sombreado no hover.
- **Desabilitado:** opacidade 0.55 e cursor proibido.

### Tabs
- **Style:** três abas de largura igual sobre um filete preto de 2px; ícone de 16px + rótulo condensado.
- **State:** repouso em tinta 2; hover em papel sombreado; selecionada em fundo preto com texto branco.

### Segmented Control
- **Style:** trilho branco com contorno preto de 1.5px, divisórias pretas entre opções, 44px de altura.
- **State:** opção marcada em preto com texto branco; foco por contorno amarelo de 3px por dentro.

### Inputs / Fields
- **Style:** folha branca, contorno de 1.5px em tinta 3, cantos de 6px, padding de 11px 13px. A lista de deck tem no mínimo 220px de altura e números tabulares.
- **Hover:** contorno passa a tinta preta.
- **Focus:** contorno preto mais halo amarelo de 3px (`box-shadow: 0 0 0 3px` amarelo de processo).

### Outcome Tags
Etiquetas curtas que dizem a origem do texto; nunca só cor.
- **Reescrita (PT):** ciano escuro sólido, texto branco.
- **Imagem PT (PT img):** branco com contorno interno de 1.5px em ciano escuro.
- **Sem tradução (EN):** magenta sólido, texto branco.
- **Moldura não suportada (EN):** branco com contorno interno de 1.5px em magenta.
- **Exemplo:** amarelo com texto preto, presa na borda esquerda da carta.
A legenda do resumo repete essas quatro formas em amostras de 14px.

### Messages
- **Erro:** magenta lavado, texto magenta profundo, contorno de 1.5px em magenta.
- **Sucesso:** ciano lavado, texto ciano noturno, contorno de 1.5px em ciano escuro.
- **Nomes não encontrados:** folha branca com contorno tracejado magenta, recolhível.

### Navigation
Faixa ciano de processo com 56px de altura: marca de registro de 26px e o nome em largura 118% à esquerda; links pretos condensados (600, 0.9375rem, largura 88%) à direita, sublinhado de 2px no hover.

### Proof Sheet (assinatura)
Folha branca de até 720px com a sombra de folha, tira de controle de cor (ciano, magenta, amarelo, preto e dois cinzas de preto) no canto superior esquerdo, rótulo "Folha n/N" à direita, marcas de registro nas quatro margens, grade 3×3 de cartas com marcas de corte e legenda técnica condensada, e rodapé com régua de 5 cm e a linha de acabamento ("A4 · na frente da carta · 300 dpi · imprimir em 100%"). Quando uma carta é montada ou trocada, a animação de registro (0.7s, `cubic-bezier(0.16, 1, 0.3, 1)`) parte das três tintas desalinhadas em sombras coloridas e as alinha sobre a imagem.

Prova e acabamento: a carta que espera a rede neural entra primeiro como rascunho (já em português, com a mesma animação de registro) e leva uma etiqueta branca sobre a arte, nunca sobre o texto, com o passo em condensada tabular ("Acabamento 2/3") e um trilho de 4px em papel sombreado com o andamento em ciano escuro; sem medida (fila, preparo), um trecho de 35% de ciano escuro corre pelo trilho, parado e claro com movimento reduzido. Quando o acabamento fica pronto, a imagem troca com outra animação de registro. Na gaveta, a frase inteira ("Acabamento: parte 2 de 3, cerca de 35 s") vai no lugar da etiqueta de resultado, com o trilho de 6px.

### Card Drawer
Gaveta lateral de até 600px, altura total, borda superior ciano de 6px e filete preto sob o cabeçalho. Entra deslizando 40px da direita em 0.32s. Contém prévia da carta, botão "Ver no tamanho real" (63 mm), contador de quantidade com contorno preto e a grade de artes; a arte escolhida fica em ciano lavado com contorno interno de 2.5px em ciano escuro.

## Do's and Don'ts

### Do:
- **Do** mostrar a carta como ela vai sair: na folha 3×3, na proporção 63:88, com marcas de corte e legenda técnica.
- **Do** usar o ciano escuro de texto (cyan-ink) para todo botão e link com texto branco ou sobre fundo claro.
- **Do** separar blocos com filetes pretos de 2px e listas com filetes de 1px no tom do filete (rule).
- **Do** variar a largura da Archivo: larga no nome e nos títulos, condensada (62% a 88%) em rótulos, abas e legendas.
- **Do** acompanhar toda cor de resultado com texto ("PT", "EN", "PT img") e manter alvos de toque de pelo menos 44px.
- **Do** usar o amarelo de processo como halo de foco e marca-texto, sempre com texto preto.
- **Do** respeitar `prefers-reduced-motion`: animações e transições caem para 0.01ms.

### Don't:
- **Don't** usar o magenta como cor de ação ou de marca; ele é reservado a avisos de tradução, erros e remoção.
- **Don't** pôr texto branco sobre o ciano de processo (#0086c9); ele só recebe texto preto.
- **Don't** introduzir uma segunda família tipográfica.
- **Don't** dar sombra ou fundo de cartão a painéis da casca; só folha, gaveta, lista suspensa e carta flutuam.
- **Don't** trocar a prova por uma lista genérica de resultados ao lado de um formulário.
- **Don't** usar "Magic", "MTG" ou logos da Wizards como marca visual; a marca é a marca de registro.
