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
| MtG Proxy Printer (site, novembro de 2026) | Cola a lista e troca a caixa de texto por uma caixa lisa da cor da moldura, com a tradução oficial ou de máquina | Sim, mas a caixa perde o desenho da moldura, e sem tradução oficial entra a de máquina |
| Card Conjurer | Editor de cartas com molduras e texto livre | Manual; saiu do ar oficialmente em 2022 após notificação da Wizards |
| Gráficas de proxy | Vendem a carta impressa | Não, e vender proxy é proibido pela Wizards |

**A lacuna:** nenhuma ferramenta pega qualquer impressão e reescreve o texto oficial em português. Todas dependem de já existir uma imagem em português. Esse é o diferencial do Proxinho.

## Cobertura da tradução oficial

Cruzando a lista de cartas do Scryfall com o texto do Arena e com as impressões em português (21/11/2026):

| Cartas legais no Commander | Cartas | % |
|---|---:|---:|
| Total | 31.597 | 100 |
| Com o texto PT-BR do Arena | 15.734 | 49,8 |
| Só com o texto de uma impressão em português | 10.730 | 34,0 |
| Com texto oficial (uma das duas) | 26.464 | 83,8 |
| Sem texto, com a imagem oficial em português | 87 | 0,3 |
| Sem nada em português | 5.046 | 16,0 |
| Entre as 1.000 mais jogadas (EDHREC), com texto oficial | 984 | 98,4 |

Algumas impressões em português aparecem no Scryfall só com a imagem, sem o texto (Advent of the Wurm em DGM): essas não contam como tradução. E 9.819 impressões em português, quase todas de 1995 a 2001, não têm nem a imagem: no lugar dela, o Scryfall põe a carta em inglês com o selo "Localized Image Not Available", e só o nome impresso vale. Elas não viram "imagem oficial em português" (`real_image` no pipeline). A medição de 17/11 contava essas cartas como traduzidas (92,4% no total e 98,9% nas 1.000 mais jogadas). O texto impresso que existe às vezes vem com habilidades coladas, sem a quebra de linha ("reserva de mana.{3}{W}", "VoarAterragem", "Ímpeto{T}: Adicione"), e o pipeline devolve a quebra (ADR 0011); no Arena, duas regras perdem o espaço antes do símbolo ("Adicione{B}"), que volta. Criaturas sem habilidades também vêm sem o texto, mas com o tipo em PT: o texto delas é vazio de verdade, e elas contam como tradução (eram 139 cartas saindo em inglês). Uns 20 lembretes, nas duas fontes, vêm sem o "(" ou sem o ")", e um bônus do Arena vem como "+1/++1": o pipeline repõe só a pontuação, nunca palavras. Umas 17 regras trazem uma palavra repetida ("Toda vez que que"), e a cópia sai. No Arena, alguns planeswalkers vêm com uma habilidade sem o custo de lealdade no texto em PT; o custo é um número da regra, não texto traduzido, e o pipeline o copia do Oracle.

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

### Classes (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem, para a Classe (`ClassMod`), uma camada de texto por nível. Ele encolhe todas até caberem na coluna (`scale_text_layers_to_height`), espalha-as com a mesma folga acima e abaixo de cada uma (`spread_layers_over_reference`) e põe uma barra de nível entre cada duas (`position_dividers`). A barra é desenho do modelo, com o custo e o "Level N" escritos por cima. Aqui a barra faz parte da imagem escolhida: o Proxinho a recorta com o custo, tira o "Level N" e a cola onde o plano do texto em PT pede, com a mesma folga do Proxyshop (ADR 0019).

Medidas nas imagens do Scryfall (745 × 1040), em AFR, CLB, BLB, BLC, TMT, SOC e nas promos:

| Medida | Valor |
|---|---|
| Coluna de texto | x ≈ 375 a 681, do fio do lembrete ao fio de cima da barra de tipo (~867) |
| Fio preto entre a arte e a coluna | x ≈ 370 a 374 |
| Bisel cinza e fio da direita | bisel de ~681 a 686, fio escuro de ~686 a 690 |
| Lembrete do alto | caixa de altura fixa de ~121 a 203, fio fino cinza em ~206 em todas |
| Barra de nível | linha preta de 2 a 4 px na largura toda da coluna, passando pelo bisel, com um chanfro em "v" no meio (x ≈ 520 a 540, até 14 px abaixo); um brilho claro ~4 px acima; degradê cinza até ~48 px abaixo da linha |
| Rótulo da barra | custo à esquerda; "Level N" em Beleren, acabando em x ≈ 668 a 672, no meio do degradê |
| Barra de tipo | como a da Saga, de ~862 a 900 |

O que o texto em PT pede: o Arena não tem o lembrete do alto, que vem das Classes impressas em PT (o mesmo texto em inglês nas 28 Classes com texto oficial; 15 delas, de Bloomburrow e das Tartarugas Ninja, não têm imagem em PT nenhuma). O Arena traz uma linha "CLASSLEVEL [3] […]" que repete a habilidade do nível 3 da Classe: Ladino, e o texto impresso do Scryfall traz linhas "//Level_2//" entre a barra e a habilidade: as duas saem no pipeline. Na carta impressa em PT o lembrete ocupa três linhas na mesma caixa, e as barras mudam de lugar quando um nível cresce mais que os outros.

Promos de loja (AFR) com o "&" de D&D em alto-relevo: o relevo atravessa a coluna e as barras. Recortar as barras levava pedaços dele, e o resto ficava pela metade no papel apagado; elas saem na original.

### Naves e planetas com Posicionar (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop monta a Station a partir do próprio modelo, com uma camada de texto por nível, o selo e as faixas desenhados por cima, e espalha os textos com a mesma folga acima e abaixo de cada um, como na Classe. As artes estendidas da própria coleção, que vêm sem a explicação do Posicionar, fazem igual: faixas mais altas e a mesma folga em volta de cada texto. Aqui as faixas fazem parte da imagem escolhida, com a arte por trás: o Proxinho tira o escurecimento delas, apaga as letras, os selos e a caixa de P/R com a rede neural e escurece de novo onde o texto em PT pede (ADR 0020).

Medidas nas imagens do Scryfall (745 × 1040), em EOE, EOC, TRK, TRC e nas promos:

| Medida | Valor |
|---|---|
| Caixa de texto | translúcida, de x ≈ 55 a 687 (fio da esquerda de 49 a 54, beira sombreada de 684 a 687, fio da direita de 688 a 693) e de y ≈ 656 ao pé (~956, o fio claro 8 px acima da borda preta) |
| Faixas dos níveis | da largura da caixa, cada uma mais escura que a de cima (~0,87 nas molduras brancas; nas coloridas, cada canal de um jeito), com a arte atrás; o limite é uma rampa de ~4 px; a última vai até o pé da caixa |
| Selo do nível | redondo, centro em x ≈ 49,5, anel claro de raio ~29 e miolo escuro de raio ~23 com o nível em branco ("9+", "10+"), meio para fora da caixa, no meio da altura da faixa |
| Caixa de P/R | na última faixa, na altura do selo: miolo escuro de x ≈ 597 a 698 no meio, mais curto no alto e no pé (as pontas abauladas), ~42 px de altura; anel de ~6 px, que dos lados, com a beira cinza, vai até 7 px depois do miolo e embaixo, com a sombra, até 8 |
| Selo da coleção | holográfico, no meio do pé da caixa |

O que o texto em PT pede: o Arena marca cada nível com uma linha interna antes das habilidades dele (em inglês "STATIONLEVEL [9+] [3/4] [Flying] [First strike]", em PT "#StationLevelInstrinsic_NoTranslation"); o pipeline lê o nível no inglês e escreve como o Oracle ("9+ | Voar, iniciativa"). A explicação do Posicionar nunca saiu impressa em PT e os arquivos públicos do Arena não têm lembrete nenhum (nenhum dos 54.581 textos em PT tem parênteses); ela vem da dica do jogo instalado (ver a seção seguinte e o ADR 0021). 23 naves de Star Trek e de Commander não estão no Arena e seguem em inglês.

A rede neural: num quadro só, com a caixa inteira (697 px com o espelho) reduzida aos 512 px do modelo, as palavras densas da explicação em inglês viravam um borrão cinza no lugar delas (Lumen-Class Frigate, EOE 25). Em duas metades, cada uma na resolução da imagem, o borrão some. Na sem borda valeu o contrário (ADR 0015): ali as letras são brancas, finas e esparsas.

### Explicações das palavras-chave pelas dicas do Arena (20/11/2026)

De onde vem: o Arena mostra, ao lado da carta, a explicação de cada palavra-chave, traduzida oficialmente. O texto fica no banco da interface do jogo instalado, `MTGA_Data/Downloads/Raw/Raw_ClientLocalization_*.mtga`: um SQLite com a tabela `Loc` (`Key`, `Bundle` e uma coluna por idioma: `enUS`, `ptBR`…). As dicas têm chaves `AbilityHanger/Keyword/<Nome>_Body` e `AbilityHanger/AbilityWord/<Nome>_Body`, com o título em `_Title`. Na versão 2026.65 do cliente são 1.099 dicas com inglês e português. Os arquivos públicos da Untapped têm só o texto das cartas, sem as dicas.

Ninguém publica essas dicas em PT: os sites de cartas mostram o lembrete em inglês do Oracle, e as listas da comunidade traduzem por conta própria.

Como a dica se compara ao lembrete da carta (comparação com os lembretes do Oracle das cartas de papel):

| O que muda | Exemplo | O que o pipeline faz |
|---|---|---|
| Ordem das palavras | "Put charge counters on this Spacecraft equal to its power" na dica do Posicionar, "…equal to its power on this Spacecraft" na carta | Compara as palavras sem a ordem, com variáveis só de número |
| Variáveis | "{chargeRequirement}", "{numeral}", "{abilityCost}", "{mana}" | Recebem o número (em algarismos) ou o custo da carta |
| Jeito de falar da carta | "it" na dica da Dobra Espacial, "this creature" na carta; "its" no Power-up, "his" na carta do Shang-Chi | Aceito; o "it" da carta só quando é a própria carta |
| "token" | "create a 1/1 copy" na dica da Cria, "a 1/1 token copy" na carta | Aceito: o que se cria é sempre uma ficha |
| Começo de definição | "To manifest dread, look at…" na dica, "Look at…" na carta | A dica em PT perde o "Para Manifestar Pavor," |
| Símbolos | "{o2}" e "o2" | Viram "{2}" |
| Tradução errada | Enweb e Web-slinging sem o "virada"; Mayhem do terreno com "conjurar" | Fora (`HINT_SKIP`) |
| Sem tradução | Discover N, com o PT igual ao inglês | Fora |

Qualidade: dos 194 lembretes que as cartas impressas em PT já traziam e que uma dica também cobre, 81 são idênticos ao impresso e a semelhança mediana é de 98,7% (a diferença típica é "para cada" contra "por cada"). As diferenças grandes eram o impresso antigo: o atropelar dos Fractius da M14 e o toque mortífero de antes de 2010, que não dizem o mesmo que o lembrete de hoje.

Resultado: 164 lembretes em inglês ganham texto em PT, em 643 cartas (632 de papel). Os maiores grupos: Posicionar (as naves e planetas), Preparar (61 cartas de Secrets of Strixhaven), "Liguem seus motores!" (39), Exaustão (33), Dobra Espacial (29), Definhar (29), Bushido (26), Manifestar Pavor (22) e Cria (20). Ficam de fora as cartas com número por extenso ("Mobilize 2" diz "two", e a dica sairia "2"), as dicas que dizem outra coisa (Prototype, Suspend sem o "it has haste", Partner com "Parceiro" onde a carta diz "this ability") e a "it" que não é a própria carta (o Changeling da ficha do Stalactite Dagger).

## Cartas prontas no servidor (21/11/2026)

O João pediu a experiência instantânea, com tudo montado no servidor (o Proxinho é para ele e para colegas próximos, decisão de 20/11/2026). Como o mercado faz:

- **Imagem pronta num CDN** é o padrão de quem abre na hora: o MPC Autofill serve imagens já montadas por um cache na borda, e o Scryfall e os sites de deck servem a imagem da carta. Quem monta (Card Conjurer, MtG Proxy Printer, Proxyshop no desktop) monta uma carta por vez, no aparelho, e a pessoa espera.
- **Montar sob demanda num navegador da nuvem** (Cloudflare Browser Run): 10 horas por mês no plano pago e US$ 0,09 por hora depois; a primeira visita continua esperando, e a rede neural (15 s a 1 min por carta no processador) passa do incluído.
- **Outro motor no servidor** (node-canvas, Skia) seriam dois motores para manter iguais, com fontes e antialiasing diferentes.

A escolha (ADR 0022): o mesmo motor, rodado de antemão num Chromium com o Playwright, grava cada carta no R2 com a mesma chave das cartas guardadas no navegador (o resumo do código, as fontes e a entrada inteira da carta), e o site procura lá antes de montar. São 57.693 artes suportadas com texto oficial (21.470 cartas, 3.616 sem borda, 615 de duas faces), ~115 mil imagens (prévia e face do PDF) e ~20 GB: o R2 cobra US$ 0,015 por GB por mês além dos 10 GB grátis (KV seria US$ 0,50 por GB). A arte padrão de cada carta vem primeiro, das mais jogadas às menos.

**Onde rodar a montagem, de graça (21/11/2026).** A documentação de cobrança do GitHub Actions diz que as máquinas padrão são grátis em repositório público e que as maiores são cobradas mesmo em público; cada job tem no máximo 6 horas e uma conta grátis roda até 20 jobs ao mesmo tempo. A cota grátis do R2 (10 GB, 1 milhão de gravações e 10 milhões de leituras por mês) é da conta inteira, e o plano Workers Paid não a aumenta; acima dela, US$ 0,015 por GB por mês. Para o job gravar sem senha guardada, o padrão de mercado é o token OIDC do provedor de CI (a "publicação confiável" do PyPI e do npm, e o acesso do GitHub Actions à AWS, ao Google Cloud e à Azure): o GitHub assina um JWT de poucos minutos com o repositório, a branch e o workflow, e quem recebe confere a assinatura com as chaves públicas de `token.actions.githubusercontent.com/.well-known/jwks` e as afirmações, pelo número do repositório (o nome muda com renomeação). A escolha (ADR 0023): 12 máquinas padrão, o token OIDC conferido pelo Worker e um limite de 5 GB no depósito, com a rede neural primeiro.

## Tradução das cartas sem texto oficial (21/11/2026)

Depois de tirar a falsa imagem em PT do Scryfall, 7.384 cartas ficavam sem texto oficial, 987 delas entre as 10 mil mais jogadas no EDHREC. O João pediu para traduzi-las, marcadas como não oficiais.

- **Padrão de mercado.** O MtG Proxy Printer, o concorrente mais próximo, troca o texto por uma caixa lisa e usa tradução de máquina (um tradutor de IA, o Google ou a Microsoft), com um selo "MT" na carta. Erra a terminologia que o Arena escreve sempre igual ("terra" por "terreno", "lançar" por "conjurar").
- **Estado da arte.** Tradução guiada por glossário e por exemplos aprovados (memória de tradução). Na tarefa de terminologia do WMT 2025, dar a terminologia certa melhorou a qualidade e o acerto dos termos, e os melhores sistemas chegaram perto de 100% de acerto por frase. Traduzir e depois revisar impondo os termos (DuTerm, 2025) e buscar exemplos aprovados na hora de traduzir são o que a localização de jogos usa hoje.
- **A memória que já existe.** As 26.416 faces oficiais dão 29.629 linhas distintas pareadas com o Oracle. Nas 3.955 cartas que ganharam a tradução até agora, 39% das linhas já tinham saído iguais numa carta oficial e 5% só mudavam nos números (o molde da oficial serve); 56% precisaram de tradução.

A escolha (ADR 0025): a linha oficial igual, depois o molde, depois a tradução feita uma vez, com os pares oficiais parecidos à vista e o glossário das cartas oficiais, guardada no repositório e conferida nos números e símbolos. A carta só ganha a tradução quando todas as linhas e o tipo têm tradução, e a interface a marca como não oficial.

## Lado legal e o caminho seguro

| Ponto | O que diz | Risco |
|---|---|---|
| Política de Conteúdo de Fãs da Wizards | Permite conteúdo de fã gratuito; proíbe vender, usar logos e tirar avisos de copyright; exige o aviso de "não aprovado". E exclui expressamente criar proxies, mesmo grátis ("does not include … creating counterfeit/proxy Magic cards"): não é permissão para o Proxinho | Médio: a tolerância vem da posição de 2016 (uso pessoal). O Proxinho é para o dono e colegas próximos (decisão de 20/11/2026) |
| Posição da Wizards sobre proxies (2016) | O foco é falsificação e eventos oficiais; não fiscalizam cartas de teste para uso pessoal | Baixo no uso pessoal |
| Card Conjurer (2022) | Gerador web recebeu notificação; a Wizards citou cópia literal de texto e arte | Médio num site público |
| Termos do Arena | Proíbem engenharia reversa | Alto se extrair do programa: não fazemos. Desde 20/11/2026 lemos só as dicas das palavras-chave no banco da interface (SQLite) da instalação do dono do projeto, com o ok dele, fora do repositório (ADR 0021): rever antes de abrir ao público |
| Dados da Untapped | Arquivos públicos, sem termos claros de reuso | Médio: pedir autorização antes de divulgar |
| Regras de imagem do Scryfall | Não cortar artista e copyright, não distorcer, não pôr marca d'água, e não "simplesmente reempacotar, republicar ou servir como proxy" os dados do Scryfall | Médio: as cartas montadas no servidor (ADR 0022) são imagens derivadas, num depósito privado, sem galeria nem listagem; avisar o Scryfall antes de abrir ao público |
| Fontes das cartas | Beleren e Plantin são de terceiros | Arquivos fornecidos pelo dono do projeto, servidos do KV e fora do repositório; reserva livre: Eczar e Splentinex (OFL). Rever antes de abrir ao público |

**O que o Proxinho faz para ficar no caminho seguro:** é grátis, não vende impressão, é para o dono e colegas próximos, guarda as cartas montadas num depósito privado servido só pelo site, pela chave exata, sem galeria, listagem nem indexação (ADR 0022), não extrai nada do cliente do Arena além das dicas das palavras-chave (ADR 0021), mantém artista e copyright, mostra o aviso de conteúdo de fã no site e no PDF e não usa nomes ou logos da Wizards como marca.

**Pendente antes de divulgar amplamente:** pedir autorização à Untapped e avisar o Scryfall.
