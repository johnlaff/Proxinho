# ADR 0008: Preenchimento por rede neural nas caixas translúcidas

- Status: aceito
- Data: 17/11/2026

## Contexto

Para trocar o inglês pelo português, o motor apaga as letras e preenche o buraco. O preenchimento original é o push-pull em pirâmide (`erase.ts`): uma média borrada da vizinhança. No pergaminho liso das cartas comuns isso some. Nas caixas de texto dos planeswalkers não: elas são translúcidas, a arte aparece por trás, e o borrão ficava visível como uma mancha em volta de cada linha apagada (ADR 0007).

## Opções

1. **Refazer a moldura a partir de um modelo** (como o Proxyshop e o Card Conjurer): desenhar a caixa do zero sobre a arte. Exige recriar cada variante de moldura e perde a fidelidade à impressão escolhida.
2. **Síntese de textura por patches** (PatchMatch, o "preenchimento sensível ao conteúdo" clássico). Sem modelo para baixar, mas repete pedaços da arte e erra em gradientes.
3. **Inpainting por rede neural.** O LaMa (Suvorov et al., 2021) é o modelo de referência para remover texto e objetos; o MI-GAN é a versão leve para celular. Os dois rodam no navegador com o ONNX Runtime Web.

## Decisão

Opção 3, com o **LaMa** numa versão quantizada (pesos int4/int8, 37 MB, Apache 2.0, revisão fixa do Hugging Face conferida por SHA-256), só nas caixas de texto dos planeswalkers. Nome e linha de tipo, que ficam em barras opacas, continuam no push-pull.

- **Onde roda:** numa worker (`lamaWorker.ts`), na placa de vídeo (WebGPU) quando há e na CPU (WebAssembly) quando não. O site manda os cabeçalhos de isolamento de origem (`COOP same-origin` e `COEP credentialless`) para liberar várias threads na CPU.
- **Quadro:** o modelo trabalha em 512 × 512. A caixa inteira (~600 px no PNG) é recortada com margem e redimensionada para um quadro só; quadros sobrepostos deixavam emendas de tom.
- **Máscara:** a mesma das letras, dilatada um pouco mais e presa às faixas de texto (os dois-pontos depois do escudo ficam intactos).
- **Imagem:** planeswalker usa o PNG também na prévia; o JPEG da prévia deixava restos de letra. A caixa limpa fica guardada e o PDF a reaproveita.
- **Hospedagem:** o modelo e o runtime passam do limite de 25 MiB por arquivo dos assets do Cloudflare, então `scripts/modelo.mjs` os divide em partes no build (fora do git) e a worker junta. Não há chamada a serviço de terceiros: tudo sai do próprio domínio.
- **Falha:** sem rede, navegador antigo ou erro no modelo, volta para o push-pull.

## Consequências

- A mancha some: a textura da arte continua por trás do texto em português.
- O primeiro planeswalker da sessão baixa cerca de 66 MB (modelo e runtime; o navegador guarda). Cada carta leva menos de 1 s na placa de vídeo e cerca de 6 s na CPU com 4 threads.
- `COEP credentialless` exige que recursos de outra origem venham por CORS (as imagens do Scryfall já vêm) e não existe no Safari, que então roda o LaMa com uma thread na CPU ou na placa de vídeo.
