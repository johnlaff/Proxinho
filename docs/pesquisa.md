# Pesquisa: a dor, o estado da arte e o lado legal

Levantamento feito em 17/11/2026, antes de escrever a primeira linha de código. É a fase de "Inception" do projeto (ver [aidlc.md](aidlc.md)).

## A dor

- Modern Horizons 3 (junho de 2024) foi a última coleção impressa em português. Daí em diante, cartas físicas só em inglês.
- Cerca de 5% dos brasileiros falam inglês e cerca de 1% com fluência (British Council / Data Popular).
- O MTG Arena continua em português, inclusive nas coleções novas. Quem aprende pelo Arena chega ao papel e encontra só inglês.
- Mesmo cartas que saíram em português raramente têm a arte que a pessoa quer em português, e só 4% das 38.832 imagens em português do Scryfall estão em alta resolução (1.620).

## O que já existe

| Ferramenta | O que faz bem | Português |
|---|---|---|
| MPCFill | Banco comunitário de imagens em alta e pedido na MakePlayingCards | Só imagens prontas, quase todas em inglês |
| Proxxied | Cola a lista, escolhe a arte e gera PDF com marcas de corte | Não |
| MTGProxyPrinter | App de desktop aberto; PDF em A4/Carta; opção de "traduzir" | Parcial: troca pela imagem PT do Scryfall quando existe |
| Card Conjurer | Editor de cartas com molduras e texto livre | Manual; saiu do ar oficialmente em 2022 após notificação da Wizards |
| Gráficas de proxy | Vendem a carta impressa | Não, e vender proxy é proibido pela Wizards |

**A lacuna:** nenhuma ferramenta pega qualquer impressão e reescreve o texto oficial em português. Todas dependem de já existir uma imagem em português. Esse é o diferencial do Proxinho.

## Cobertura da tradução oficial

Cruzando a lista de cartas do Scryfall com o texto do Arena e com as impressões em português (17/11/2026):

| Cartas legais no Commander | Cartas | % |
|---|---:|---:|
| Total | 31.597 | 100 |
| Com impressão física em português | 24.519 | 77,6 |
| Com texto PT-BR no Arena | 15.781 | 49,9 |
| Com pelo menos uma das duas | 29.191 | 92,4 |
| Entre as 1.000 mais jogadas (EDHREC) | 989 | 98,9 |

Algumas impressões em português aparecem no Scryfall só com a imagem, sem o texto (Advent of the Wurm em DGM): essas não contam como tradução. O texto impresso que existe às vezes vem com habilidades coladas, sem a quebra de linha ("reserva de mana.{3}{W}", "VoarAterragem", "Ímpeto{T}: Adicione"), e o pipeline devolve a quebra (ADR 0011); no Arena, duas regras perdem o espaço antes do símbolo ("Adicione{B}"), que volta. Criaturas sem habilidades também vêm sem o texto, mas com o tipo em PT: o texto delas é vazio de verdade, e elas contam como tradução (eram 139 cartas saindo em inglês). Uns 20 lembretes, nas duas fontes, vêm sem o "(" ou sem o ")", e um bônus do Arena vem como "+1/++1": o pipeline repõe só a pontuação, nunca palavras. Umas 17 regras trazem uma palavra repetida ("Toda vez que que"), e a cópia sai. No Arena, alguns planeswalkers vêm com uma habilidade sem o custo de lealdade no texto em PT; o custo é um número da regra, não texto traduzido, e o pipeline o copia do Oracle.

As que faltam são quase todas exclusivas de decks prontos de Commander de 2022 a 2026, que não estão no Arena. Hoje elas saem em inglês, marcadas. Uma tradução assistida pelo glossário do Arena, marcada como não oficial, está no [roadmap](roadmap.md).

## Importação de decks

| Origem | Como | Situação |
|---|---|---|
| Lista colada (MTGO, Arena, Moxfield, Archidekt, ManaBox, Liga Magic) | Um leitor único que aceita quantidade, coleção, número, foil, seções e nomes em português | Feito |
| Busca manual | Nome em português ou inglês, com autocompletar | Feito |
| Link do Archidekt | API pública, mas o CORS libera só localhost: passa pelo Worker | Feito |
| Link do Moxfield | A API responde 403 para terceiros; orientamos "Exportar → copiar" | Tentativa + orientação |

## Fichas (tokens)

Pesquisa de 17/11/2026. Impressões de fichas em português quase não existem no Scryfall. O Arena tem as fichas como cartas (`isToken` no `cards.json`), com nome, tipo e habilidades em PT-BR. Casando nome, tipos, P/R e texto em inglês sem lembretes, 534 das 795 fichas do Scryfall ganham texto oficial, o que cobre cerca de 82% das referências a fichas nas cartas legais em Commander (a maior parte do que falta são fichas raras de uma carta só). Nenhuma ferramenta de proxy olhada (Proxxied, MPCFill, MTGProxyPrinter) sugere as fichas do deck; o MPCFill tem fichas, mas só como imagem pronta. Decisão no ADR 0009.

Emblemas: o Arena não tem os emblemas de papel e o Scryfall não tem emblemas em PT, mas o texto de cada emblema está entre aspas na habilidade do planeswalker ("Você recebe um emblema com …"), oficial. 81 dos 89 emblemas saem assim (ADR 0010).

## Apagar texto sobre arte (planeswalkers e sem borda)

As caixas de texto dos planeswalkers são translúcidas: a arte aparece por trás das letras. O preenchimento por média da vizinhança deixa ali uma mancha borrada. O que existe (pesquisa de 17/11/2026):

| Abordagem | Quem usa | Para nós |
|---|---|---|
| Refazer a moldura a partir de modelos | Proxyshop (Photoshop), Card Conjurer | Fiel ao modelo, não à impressão escolhida; exige recriar cada moldura |
| Síntese por patches (PatchMatch) | "Preenchimento sensível ao conteúdo" clássico | Sem download, mas repete pedaços e erra em gradientes |
| Inpainting por rede neural (LaMa, MI-GAN) | IOPaint, removedores de marca d'água no navegador | Estado da arte para remover texto; LaMa quantizado tem 37 MB e roda com ONNX Runtime Web (WebGPU ou WebAssembly) |

Escolha: LaMa quantizado, só nas caixas dos planeswalkers (ADR 0008).

### Artes sem borda (19/11/2026)

Nas artes sem borda as barras e a caixa inteiras são translúcidas, e a arte atrás é mais variada que nos planeswalkers (gravuras, retícula de impressão, robôs, céus). A pesquisa de novo:

| Abordagem | Para nós |
|---|---|
| Refazer a moldura a partir de modelos (Proxyshop, Card Conjurer) | Precisa da arte sem o texto, que a imagem da carta não tem: a arte passa por trás da caixa |
| Remoção de texto de cena por difusão (modelos de inpainting de difusão) | Melhor em fundos complexos, mas pesa gigabytes e leva segundos por quadro na placa de vídeo; inviável no navegador |
| MI-GAN | Mais leve que o LaMa, mas pior em textura repetida |
| LaMa na resolução da imagem, com máscara só das letras | Reaproveita o modelo que já está no site. A rede trabalha em 512 px: reduzir a caixa inteira para isso apagava o desenho fino da arte; em quadros na resolução da imagem, um depois do outro, ela continua a textura. A retícula grossa de impressão (2 a 3 px) ela não refaz: essas cartas saem na original |

Escolha: LaMa em quadros na resolução da imagem, com a máscara só das letras brancas e o grão da vizinhança de volta depois (ADR 0012).

### Rede neural no navegador do celular (19/11/2026)

A prévia de uma arte sem borda ficou parada em "Montando a prévia…" no Firefox do celular. O que se faz hoje para rodar um modelo de imagem no navegador, e onde o Proxinho está:

| Prática | Quem faz | Proxinho |
|---|---|---|
| Modelo numa worker, fora da página | transformers.js, ONNX Runtime Web, inpaint-web | Sim, desde o começo (ADR 0008) |
| Placa de vídeo (WebGPU) com a CPU (WebAssembly) de reserva | transformers.js, ONNX Runtime Web | Sim |
| Modelo guardado pelo navegador depois do primeiro download | transformers.js e os removedores de objeto no navegador | Sim |
| Andamento do download na tela | transformers.js (`progress_callback`) e as demonstrações do Hugging Face | Não havia; agora a prévia mostra a etapa e a porcentagem |
| Tempo-limite e plano B quando o runtime trava | o ONNX Runtime Web tem `env.wasm.initTimeout`; os apps põem tempo-limite e trocam de backend | Não havia; agora um vigia troca a worker por uma com uma thread e, por fim, desiste do jeito certo para cada moldura |
| Modelo leve para celular | MI-GAN (ICCV 2023): cerca de um décimo da conta do LaMa, com qualidade parecida em 512 px, 29 MB em ONNX; usado pelo inpaint-web e pelo WatermarkOut | Não: LaMa quantizado (37 MB) |
| Kernels próprios em WebGPU | wipe.photos: o LaMa em shaders próprios, menos de 1 s, também no Android e no iPhone | Não: ONNX Runtime Web |

Entre os geradores de proxy, o Card Anvil também usa o LaMa para limpar a arte.

A trava: no ONNX Runtime Web, uma thread do WebAssembly que não sobe deixa o carregamento do modelo esperando para sempre, sem erro. O `initTimeout` dele não resolve sozinho, porque depois do tempo esgotado o runtime não se recupera; só uma worker nova volta a funcionar. Por isso o vigia encerra a worker e cria outra, mais simples (ADR 0008).

Conclusão: no essencial o Proxinho segue a prática do mercado (worker, WebGPU com a CPU de reserva, modelo guardado), e passou a seguir também no andamento e no tempo-limite. A diferença que sobra é a velocidade na CPU dos celulares sem WebGPU, como o Firefox do Android: ali cada quadro leva dezenas de segundos, e a arte sem borda tem três. O Chrome do Android usa a placa de vídeo. O próximo passo, se a espera incomodar, é o MI-GAN só na prévia (roadmap).

## Lado legal e o caminho seguro

| Ponto | O que diz | Risco |
|---|---|---|
| Política de Conteúdo de Fãs da Wizards | Permite conteúdo de fã gratuito; proíbe vender, usar logos e tirar avisos de copyright; exige o aviso de "não aprovado" | Baixo, se grátis |
| Posição da Wizards sobre proxies (2016) | O foco é falsificação e eventos oficiais; não fiscalizam cartas de teste para uso pessoal | Baixo no uso pessoal |
| Card Conjurer (2022) | Gerador web recebeu notificação; a Wizards citou cópia literal de texto e arte | Médio num site público |
| Termos do Arena | Proíbem engenharia reversa | Alto se extrair do cliente: não fazemos |
| Dados da Untapped | Arquivos públicos, sem termos claros de reuso | Médio: pedir autorização antes de divulgar |
| Regras de imagem do Scryfall | Não cortar artista e copyright, não distorcer, não pôr marca d'água | Médio: avisar o Scryfall |
| Fontes das cartas | Beleren e Plantin são de terceiros | Arquivos fornecidos pelo dono do projeto, servidos do KV e fora do repositório; reserva livre: Eczar e Splentinex (OFL). Rever antes de abrir ao público |

**O que o Proxinho faz para ficar no caminho seguro:** é grátis, não vende impressão, gera tudo no navegador (o servidor não guarda nem distribui imagens de cartas, e não há galeria pública), não extrai nada do cliente do Arena, mantém artista e copyright, mostra o aviso de conteúdo de fã no site e no PDF e não usa nomes ou logos da Wizards como marca.

**Pendente antes de divulgar amplamente:** pedir autorização à Untapped e avisar o Scryfall.
