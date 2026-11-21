# ADR 0023: Montagem no GitHub Actions, sem senha guardada e com limite de 5 GB

- Status: aceito
- Data: 21/11/2026
- Complementa: ADR 0022 (cartas montadas no servidor); muda a ordem do item 5 dele

## Contexto

O montador em lote (ADR 0022) leva horas: ~58 mil faces, as comuns a ~1,5 s e as da rede neural a ~20 s no processador. Em 21/11/2026 o João decidiu:

- rodar as execuções longas no GitHub, com a condição de que seja de graça;
- não passar da cota grátis do R2. A cota é de 10 GB, para a conta inteira, todos os projetos juntos, e o plano Workers Paid não a aumenta. O limite combinado é de 5 GB, e o montador tem de parar sozinho nele.

As máquinas padrão do GitHub Actions são grátis em repositório público. As maiores são cobradas mesmo em público, e sem cartão cadastrado o GitHub bloqueia em vez de cobrar.

Para gravar no depósito, o job precisa provar ao Worker quem é. A primeira ideia era guardar a senha do montador (`CARTAS_TOKEN`) como segredo do GitHub. Isso deixaria uma senha de vida longa, que grava no depósito, num repositório público. O ambiente `producao` do GitHub também não tem os segredos da Cloudflare: o deploy e os dados diários pulam os passos que os pedem.

O padrão de mercado para um job de CI provar quem é sem segredo guardado é o token OIDC do provedor de CI: um JWT assinado pelo GitHub, que vale alguns minutos e diz o repositório, a branch e o workflow que o pediram. É o que usam a AWS, o Google Cloud, a Azure e a publicação confiável do PyPI e do npm.

## Decisão

1. **O workflow `.github/workflows/montagem.yml`.**
   - Quando roda: depois de cada push na main que passa na esteira, todo dia depois dos dados diários, e à mão.
   - O job `conferir` (uns segundos, sem dependências) só segue se as quatro condições valem:
     - o repositório é público;
     - o site no ar é do mesmo código deste commit;
     - depois de apagar as cartas dos códigos velhos, ainda cabem pelo menos 10 MB por parte no depósito.
   - Doze jobs `montar` dividem as faces em rodízio (`--partes 12 --parte K`): cada parte fica com 1/12 do que cabe.
   - Os jobs `montar` rodam só em `ubuntu-latest` e param de começar carta nova aos 320 minutos (`--prazo-min`); a máquina tem 360. A próxima rodada continua de onde parou, porque só monta o que falta.
2. **Token OIDC no lugar da senha** (`worker/github.ts`). O job pede ao GitHub um token com o destinatário `proxinho-montagem`. O Worker confere:
   - a assinatura RS256, com as chaves públicas do GitHub, guardadas por uma hora;
   - o emissor, o destinatário e a validade;
   - o repositório e o dono pelos números do GitHub (`MONTAGEM_REPO_ID` e `MONTAGEM_DONO_ID` em `wrangler.jsonc`), que não mudam com renomeação;
   - a branch `main`, o arquivo `montagem.yml` em `workflow_ref` e uma máquina do GitHub (`runner_environment`).

   Um fork, um pull request, outra branch, outro workflow do mesmo repositório ou uma máquina própria não gravam nada. A senha do montador continua valendo para rodar à mão.
3. **Limite do depósito inteiro.**
   - O montador mede o depósito (`GET /api/cartas` devolve os códigos, os bytes e as imagens) e divide o que falta até 5 GB entre as partes.
   - A prévia e a face do PDF de cada face vão juntas ou nenhuma, e a parte para quando a próxima passaria do seu pedaço.
   - Com o depósito cheio, a rodada diária termina no job `conferir`.
4. **A ordem.**
   - Primeiro as artes que passam pela rede neural, todas as suportadas: são as lentas no aparelho, ~4.500 faces e ~1,4 GB.
   - Depois a arte que o site escolhe sozinho, das cartas mais jogadas às menos (EDHREC).
   - Depois as outras artes, até o limite.
   - Cada parte planeja todas as cartas na mesma ordem antes de montar, e as fases passam por todas as cartas.
5. **O mesmo código, conferido sem a Cloudflare.**
   - `GET /api/health` devolve `codigo`, o resumo do código que desenha no build no ar.
   - `scripts/codigo.ts` calcula o mesmo resumo sem dependências. Os builds do site e do montador o usam.
   - A lista de cartas vem de `GET /api/cartas/lista`, com a mesma autorização, e não mais do D1 pelo wrangler.

## Alternativas

- **A senha do montador como segredo do GitHub**: funciona, mas é uma senha de vida longa que grava no depósito. Ela pode vazar num log ou num workflow mudado, e teria de ser trocada à mão.
- **Um token da API da Cloudflare no GitHub**, para o montador usar o wrangler: dá permissão demais (Workers, D1, R2 da conta inteira) para gravar imagens.
- **Uma máquina só**: passa de 24 horas para refazer tudo depois de uma mudança no motor, e cada job do GitHub tem no máximo 6 horas.
- **Máquinas maiores do GitHub**: são cobradas mesmo em repositório público.
- **O computador do João**: teria de ficar ligado por horas a cada mudança no motor.
- **Guardar tudo (~20 GB)**: passa da cota grátis da conta. O que não cabe é montado no aparelho, como antes. As cartas comuns levam ~1 s.

## Consequências

- De graça: máquinas padrão num repositório público, e o depósito fica abaixo de 5 GB dos 10 GB grátis da conta.
- Cabem ~15 mil faces: todas as da rede neural e a arte padrão das cartas mais jogadas. O resto é montado no aparelho, como antes, em ~1 s por carta.
- Uma mudança no motor muda o código. A rodada seguinte apaga as cartas velhas e monta tudo de novo, em ~2 a 3 horas com 12 partes. Enquanto isso, o site monta no aparelho o que falta.
- Enquanto o deploy na main pula por falta dos segredos da Cloudflare no GitHub, a publicação é feita à mão. A montagem que roda depois do push encontra o site com outro código e não faz nada. A rodada diária, ou uma rodada à mão depois da publicação, monta.
- Nenhum segredo da montagem fica no GitHub. Quem pode mudar `montagem.yml` na main pode gravar no depósito, e isso pede acesso de escrita ao repositório.
