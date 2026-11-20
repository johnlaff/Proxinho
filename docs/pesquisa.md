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

O Arena tira a explicação das palavras-chave (o lembrete entre parênteses), que a carta física traz. Das faces com texto do Arena, 5.468 têm lembrete no Oracle e 5.295 vêm sem; das impressões em PT desde o Magic 2010 saem 1.121 lembretes com texto oficial, casados linha a linha com o Oracle, e 3.879 cartas ganham a explicação (ADR 0018). As mecânicas que nunca saíram impressas em PT ficam sem.

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

Escolha: LaMa em quadros na resolução da imagem, com a máscara só das letras brancas e o grão da vizinhança de volta depois (ADR 0012). Depois que a retícula grossa passou a sair na original, a caixa voltou a um quadro só, reduzido: igual na regressão das 260 artes e 30% mais rápido (ADR 0015).

### Rede neural no navegador do celular (19/11/2026)

A prévia de uma arte sem borda ficou parada em "Montando a prévia…" no Firefox do celular. O que se faz hoje para rodar um modelo de imagem no navegador, e onde o Proxinho está:

| Prática | Quem faz | Proxinho |
|---|---|---|
| Modelo numa worker, fora da página | transformers.js, ONNX Runtime Web, inpaint-web | Sim, desde o começo (ADR 0008) |
| Placa de vídeo (WebGPU) com a CPU (WebAssembly) de reserva | transformers.js, ONNX Runtime Web | Parecia que sim; a placa de vídeo falhava no LaMa e tudo caía para a CPU (ver a seção seguinte) |
| Modelo guardado pelo navegador depois do primeiro download | transformers.js e os removedores de objeto no navegador | Sim |
| Andamento do download na tela | transformers.js (`progress_callback`) e as demonstrações do Hugging Face | Não havia; agora a prévia mostra a etapa e a porcentagem |
| Tempo-limite e plano B quando o runtime trava | o ONNX Runtime Web tem `env.wasm.initTimeout`; os apps põem tempo-limite e trocam de backend | Não havia; agora um vigia troca a worker por uma com uma thread e, por fim, desiste do jeito certo para cada moldura |
| Modelo leve para celular | MI-GAN (ICCV 2023): cerca de um décimo da conta do LaMa, com qualidade parecida em 512 px, 29 MB em ONNX; usado pelo inpaint-web e pelo WatermarkOut | Não: LaMa quantizado (37 MB) |
| Kernels próprios em WebGPU | wipe.photos: o LaMa em shaders próprios, menos de 1 s, também no Android e no iPhone | Não: ONNX Runtime Web |

Entre os geradores de proxy, o Card Anvil também usa o LaMa para limpar a arte.

A trava: no ONNX Runtime Web, uma thread do WebAssembly que não sobe deixa o carregamento do modelo esperando para sempre, sem erro. O `initTimeout` dele não resolve sozinho, porque depois do tempo esgotado o runtime não se recupera; só uma worker nova volta a funcionar. Por isso o vigia encerra a worker e cria outra, mais simples (ADR 0008).

Conclusão (manhã de 19/11): no essencial o Proxinho seguia a prática do mercado (worker, WebGPU com a CPU de reserva, modelo guardado), e passou a seguir também no andamento e no tempo-limite. O teste do João à tarde mostrou que não bastava (seção seguinte).

### Espera da rede neural (19/11/2026, à tarde)

Com o vigia no ar, o João testou de novo: no Chrome do celular a Konia sem borda saía na hora em inglês ("esta moldura ainda não é reescrita" e, abaixo, "o apagador de texto não rodou"); no Firefox, dois minutos em "Apagando o inglês…" e ele desistiu. O pedido: corrigir, esperar o mínimo sem perder qualidade e não deixar a pessoa desistir.

O que achamos e o que o mercado faz:

| Ponto | O que achamos | Prática / estado da arte | Proxinho agora (ADR 0013) |
|---|---|---|---|
| Placa de vídeo | O runtime JSEP (o padrão do pacote `onnxruntime-web`) falha no LaMa: `[WebGPU] Kernel "[Add] …/ffc/convg2g/Add" failed`. Toda carta caía para a CPU | O runtime WebGPU próprio (`onnxruntime-web/webgpu`): quem trocou relata WebGPU no Chrome e no Safari do Mac e do iPhone com uma linha de import; o JSEP no Safari 26 sobe a ~5 GB e a aba cai (issue 26827 do onnxruntime) | Runtime WebGPU, conferido: mesmo resultado da CPU (diferença máxima de 0,03 tom em 255) |
| CPU | 6,6 a 8 s por quadro com 4 threads, 19,6 s com uma, aqui; o celular é mais lento | Runtime só de CPU (`onnxruntime-web/wasm`), menor; MI-GAN para celular | Runtime só de CPU (15 MB, 4 MB compactado). Testados e descartados: quadros do tamanho da caixa (o modelo tem medidas fixas de 512 px), manter a quantização (mais lento), outro nível de otimização (mais lento) |
| Download | 66 MB (modelo e runtime JSEP) sem compactar | Compactar; baixar só o runtime que vai rodar | 37 MB na placa de vídeo, 33 MB na CPU (gzip, descompactado na worker); o download começa quando a primeira carta entra no pedido |
| Recuo | Erro da placa de vídeo ia direto para a CPU com uma thread, a mais lenta, que também falhou no celular | Recuo por degraus | Placa de vídeo → CPU com várias threads → CPU com uma; o limite de cada quadro segue o ritmo medido |
| Espera | Só a etapa, sem parte nem tempo; a prévia em branco | NN/g: acima de 10 s, porcentagem, texto do passo ("3 de 50") e tempo estimado com folga; imagens com versão provisória que vira a final (LQIP) | Rascunho em PT em segundos, "Acabamento: parte 2 de 3, cerca de 35 s" com barra que anda, fila à parte e a carta da gaveta na frente |
| Falha | A etiqueta culpava a moldura | Dizer o motivo de verdade | "Em inglês: o apagador de texto não rodou neste navegador", com o detalhe técnico na gaveta |

Fontes: Nielsen Norman Group, "Progress Indicators Make a Slow System Less Insufferable" e "Response Times: The 3 Important Limits"; microsoft/onnxruntime, issue 26827 ("Severe CPU and memory issues in Safari/WebKit 26 with JSEP mode"); relatos de troca para `onnxruntime-web/webgpu` em projetos públicos (mailwoman, the-gathering); medições próprias no quadro da Konia (DSK 358) com o mesmo modelo.

O que sobra: a CPU do celular sem WebGPU (o Firefox do Android) continua levando dezenas de segundos por quadro; agora a carta em português aparece logo e a espera é visível. O próximo passo possível é o MI-GAN só para o rascunho (roadmap), se a qualidade empatar nas nossas artes.

### Velocidade do acabamento e do deck inteiro (19/11/2026, noite)

Com tudo funcionando, o João perguntou quanto leva um deck inteiro, se uma carta leva 47 s. Medimos no site (Chromium sem placa de vídeo, 4 núcleos, celular emulado) e em bancada com os quadros reais de 6 artes sem borda (Konia DSK 358, Squall PSS5 2, Ulamog 2X2 577, Timber Protector LTC 533, Roaming Throne LCI 344, G'raha Tia FIC 203):

| Medida | Resultado |
|---|---|
| Deck de 100 cartas (71 diferentes) só com nomes | Nenhuma carta passou pela rede neural. Todas as prévias em 45 s; o PDF levou mais 59 s, porque remonta cada carta na resolução de impressão, duas por vez |
| Mesmo deck com 6 artes sem borda | As 6 mostram o rascunho e acabam em segundo plano; o PDF levou os mesmos 60 s (as caixas limpas pela prévia são reaproveitadas) |
| Carta sem borda na CPU | Preparo do modelo 10,4 a 12,7 s (uma vez por visita) e 5,8 a 6,3 s por quadro com 4 threads (18 s com uma); 3 quadros por carta (as duas barras num, a caixa em dois) |
| MI-GAN 512 (ICCV 2023), no mesmo navegador | Preparo 0,6 s e 0,5 s por quadro (2,1 s com uma thread): 11 vezes mais rápido. Mas nos 18 quadros deixou a sombra das letras apagadas (Konia), um bloco branco no meio da arte (Roaming Throne) e riscos vermelhos inventados dentro da barra do nome (Ulamog). Reprovado para o acabamento |
| LaMa pré-otimizado (medidas fixas de 512 px e as constantes da transformada de Fourier calculadas antes, no ONNX Runtime em Python, com a quantização preservada) | Preparo de 10,4 s para 1,8 s, quadro no mesmo tempo, saída igual (no máximo 1 tom em 255 de diferença na CPU, arredondamento; idêntica no runtime WebGPU). O arquivo passa de 36,9 para 38,2 MB |
| Só fixar o lote em 1 na sessão (`freeDimensionOverrides`), no navegador | Preparo de 10,4 s para 3,2 s, saída idêntica, sem ferramenta nova no build. É o que entrou (ADR 0013, item 9); o modelo pré-otimizado no build daria 1,8 s, mas pede o `onnxruntime-node` (300 MB) |
| Caixa num quadro só, reduzida (em vez de dois na resolução da imagem) | Carta de 19 a 20 s para 13 a 14 s na CPU. Visualmente igual em 5 das 6; no Roaming Throne sobrou um risco escuro de uns 3 px entre duas linhas. Na regressão das 260 artes sem borda: 47 idênticas, nenhum defeito visível, só pingos de 1 a 5 px que a rede neural inventa nos dois modos (7 a mais num, 6 no outro). É o que entrou (ADR 0015) |
| XNNPACK no ONNX Runtime Web | Não existe no pacote web |

O que o estado da arte diz:

- **Modelos menores.** O MI-GAN (Sargsyan et al., ICCV 2023) tem 5,98 milhões de parâmetros e 15,7 GFLOPs a 512 px, contra 27 milhões e 128 GFLOPs do LaMa (Tabela 2 do artigo; o nosso é o Big-LaMa, com 51 milhões). O FID dele empata com o do LaMa, mas o LPIPS é pior (0,345 contra 0,314), e o artigo mede em fotos com buracos grandes, não em letras finas sobre arte. Ferramentas de proxy usam o MI-GAN no navegador para tirar marca-d'água (Card Anvil); nas nossas letras ele não segura a qualidade.
- **Destilação.** O caminho do próprio MI-GAN é treinar uma rede pequena imitando uma grande (knowledge distillation). Uma rede nossa, treinada com o LaMa como professor em cartas com texto apagado, poderia chegar perto da qualidade com uma fração da conta, mas pede semanas de treino em placa de vídeo.
- **Placa de vídeo no navegador.** A img.ly mediu o ONNX Runtime Web com WebGPU 16 a 20 vezes mais rápido que o WebAssembly com 16 threads num modelo de imagem. Wang et al. ("Anatomizing Deep Learning Inference in Web Browsers", ACM TOSEM 2024) medem até 28 vezes de diferença de velocidade entre aparelhos na CPU, e o Firefox uns 9% mais lento que o Chrome. Em novembro de 2026 o WebGPU está no Chrome do Android 12+ (Qualcomm, ARM, Intel desde a versão 121), no Safari do iOS 26 e no Firefox de Windows e Mac; no Firefox do Android segue atrás de uma opção, com o trabalho previsto pela Mozilla para 2026 (gpuweb, "Implementation Status").
- **NPU.** O WebNN ainda depende de uma opção ligada à mão no Chrome e no Edge (documentação do ONNX Runtime): não serve para o público.
- **Alta resolução.** O IOPaint (ex-lama-cleaner) oferece três estratégias: imagem inteira, recorte em volta do buraco e redução; recortar e reduzir são as rápidas. O Proxinho já recorta; reduzir é o teste da caixa num quadro só.

Conclusão: na CPU não há como deixar o LaMa muito mais rápido sem perder qualidade; o ganho grande por carta vem da placa de vídeo, que o Chrome do celular já usa. O que encurta o deck inteiro é preparar o modelo mais rápido (3,2 s em vez de 10 a 13 s), adiantar a montagem do PDF enquanto a pessoa revisa (hoje ~1 min no fim) e guardar no aparelho o que já ficou pronto.

Depois de feitos (ADR 0014), no mesmo deck de 100 cartas, num build local:

| Medida | Resultado |
|---|---|
| PDF logo depois das prévias, 2 cartas por vez | 61,1 s |
| PDF logo depois das prévias, 4 por vez (computador, 4 núcleos) | 55,7 s: a montagem roda na thread da página, e mais vagas ajudam pouco |
| PDF depois de 70 s de revisão (computador) | 1,8 s |
| PDF depois de 30 s de revisão (celular emulado) | 30,8 s, em vez de ~60 |
| Página durante o adiantado (30 s, celular emulado) | 27 tarefas longas, a maior de 646 ms, 14,7 s ocupados: por isso o adiantado só monta depois de 1,5 s sem toque, rolagem ou tecla |
| Segunda visita com a mesma lista (Konia sem borda, Sol Ring, Arcane Signet) | As três acabadas em 0,2 s, sem baixar a rede neural; PDF em 0,1 s; 0,9 MB guardados |

## Molduras especiais

### Sagas (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop (Photoshop) refaz a Saga a partir do próprio modelo. Ele encolhe os textos dos capítulos até caberem na coluna (`scale_text_layers_to_height`), espalha os capítulos por igual (`spread_layers_over_reference`), desenha os fios entre eles e alinha cada marcador ao seu texto (`align_vertical`). O Magic Set Editor pede as coordenadas dos marcadores e dos fios à mão. Os dois desenham os marcadores; aqui eles fazem parte da imagem escolhida, então o Proxinho faz o inverso: os marcadores ficam, e os fios e o texto se ajustam a eles (ADR 0016).

Medidas nas imagens do Scryfall (745 × 1040), em 16 coleções de DOM a TRK:

| Medida | Valor |
|---|---|
| Coluna de texto | x ≈ 58 a 368, do pé da barra do nome (119) ao fio de baixo (867) |
| Fio preto entre a coluna e a arte | x ≈ 370 a 374 |
| Fio entre faixas | sombra de ~8 px e degrau de 10 a 30 tons na largura toda; o primeiro em ~308 (356 em DMU, com "Read ahead") |
| Marcadores | hexágonos dourados em x ≈ 30 a 84, ~60 px de altura, número romano de 19 a 27 px no meio (x ≈ 57) |
| Barra de tipo | fio de cima em ~870 a 873, ~291 px abaixo do da carta comum |

O que o texto em PT pede: o Arena não tem o lembrete do alto (nem a explicação do "Adiantar leitura"), que vem das Sagas impressas em PT: são cinco lembretes em inglês no Oracle com texto oficial em PT (Sacrifique-a após III, IV e VI, o sem sacrifício das que se transformam e o "Adiantar leitura"). O Arena também tira o lembrete de palavra-chave dos capítulos, que o Oracle e a carta física trazem (o "Arregimentar Orcs 1." do Book of Mazarbul): o texto oficial vem das impressões em PT com o mesmo lembrete em inglês (1.402 lembretes; 11 Sagas ganham a explicação). E traz o texto dos capítulos agrupados repetido (o Long List of the Ents, um parágrafo seis vezes); o número de cada capítulo vem do Oracle. Com as faixas do inglês, a do alto ficava vazia e o texto dos capítulos, pequeno; com os fios no lugar novo, a letra dos capítulos fica perto do corpo do inglês (~30).

Digitalizações: nas cartas de Theros e nas promos de pré-estreia, o degrau do fio se espalha por duas linhas e não passa de 6 tons em nenhuma; medido em duas linhas, entram. Em 12 promos de pré-estreia (sobretudo de Kaldheim e Theros) o papel sai quase branco (249) e o fio é uma queda de 2 tons: não há como achá-lo sem confundir com o grão, e elas saem na original (a versão da coleção sai em PT).

### Aventuras (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem, para a Aventura (`AdventureMod`), camadas próprias para o nome, o custo, o tipo e as regras da aventura. O nome encolhe até não encostar no custo (`ScaledTextField` com o custo de referência) e as regras ocupam a caixa da página da esquerda (`FormattedTextArea` com uma caixa de referência própria, sem centralizar); a caixa principal é a página da direita. O Proxinho segue a mesma divisão sobre a imagem escolhida: cada página encaixa o próprio corpo (ADR 0017).

Medidas nas imagens do Scryfall (745 × 1040), em ELD, WOE, CLB, HOB, MOC, FIN e TDM:

| Medida | Valor |
|---|---|
| Barra do nome da aventura | y ≈ 652 a 697, x ≈ 44 até a lombada; letras em ~679; custo acabando em x ≈ 356, ~31,5 px por símbolo e ~35,5 nos híbridos (os quatro {G/W} do Bring Back começam em 213) |
| Barra do tipo da aventura | y ≈ 700 a 746, letras em ~725; no Presságio (TDM), um filete até ~752 |
| Página da esquerda | x ≈ 50 até a lombada; papel de ~747 (761 no Presságio) a ~956 |
| Lombada | a coluna mais escura em x ≈ 372 a 375 |
| Página da direita | da lombada a x ≈ 694, de ~655 a ~956; texto a partir de x ≈ 398 (388 no Presságio) |

O papel escurece em direção à lombada: na página da direita, de ~210 tons no meio a ~95 colado nela, numa faixa de até 100 px; na da esquerda, só nos últimos 6 a 8 px. Sem tirar essa sombra antes de apagar, a beira do retângulo virava "letra" e o remendo deixava um degrau (ADR 0017). No Presságio as duas páginas são lisas.

O que o texto em PT pede: o Arena traz a criatura e a aventura como duas faces, repete o flavor da criatura nas duas e não tem o lembrete "(Then exile this card…)". O nome da aventura em PT é quase sempre mais longo ("Mágica Instantânea — Aventura" contra "Instant — Adventure"), e as duas barras comprimem a letra antes de reduzir o corpo, como a impressão oficial em PT.

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
