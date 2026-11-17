# Como o projeto foi construído: AI-DLC na prática

O Proxinho foi construído por um agente de IA (Claude) trabalhando de forma autônoma durante uma noite, com o dono do produto (João) definindo o objetivo, as restrições e aprovando as decisões de produto. O processo segue o **AI-Driven Development Lifecycle** (AI-DLC), proposto pela AWS em 2025, adaptado a um projeto pequeno.

A ideia central do AI-DLC: a IA executa e propõe; as pessoas mantêm o direito de decidir. Cada fase deixa artefatos escritos que a próxima fase (ou o próximo agente) consegue ler sem precisar da conversa original.

## As três fases

| Fase | O que aconteceu | Artefatos |
|---|---|---|
| **Inception** (concepção) | Pesquisa da dor, das ferramentas existentes e do lado legal; medição da cobertura da tradução; proposta de stack; decisões de produto com o João (nome, domínio, "qualquer carta e qualquer arte") | [pesquisa.md](pesquisa.md), [PRODUCT.md](../PRODUCT.md), [specs/0001](specs/0001-gerador-de-proxies.md) |
| **Construction** (construção) | Pipeline de dados, motor da carta validado em 16 cartas reais, API, interface, PDF; cada parte com testes antes de seguir | [arquitetura.md](arquitetura.md), [adr/](adr/), `tests/` |
| **Operations** (operação) | Deploy automático, atualização diária dos dados, teste de fumaça, CodeQL, Dependabot, guia de operação | [operacao.md](operacao.md), `.github/workflows/` |

## Boas práticas aplicadas

- **Contexto escrito para agentes.** [AGENTS.md](../AGENTS.md) é curto e concreto: comandos, mapa do código, regras e uma lista de erros que já aconteceram. `CLAUDE.md` só aponta para ele.
- **Especificação antes do código.** Requisitos e critérios de aceite em [specs/](specs/), decisões em [adr/](adr/). O agente consulta esses arquivos em vez de depender da memória da conversa.
- **Pesquisar antes de implementar.** Cada parte nova começou por um levantamento do padrão de mercado (formatos de lista, APIs de importação, ferramentas de qualidade, padrões de CI/CD).
- **Testes como portão.** Nada segue sem `pnpm check` verde; a CI exige tipos, lint, formatação, testes de unidade e ponta a ponta em desktop e celular antes do deploy.
- **Validação com dados reais.** O motor foi conferido visualmente em cartas reais de várias cores e tipos; resultados estranhos viraram correções e entradas na lista de erros do AGENTS.md.
- **Humano nas decisões irreversíveis.** Criar recursos na conta da Cloudflare, o nome do produto e o visual da interface passaram pelo João; o agente trabalhou na opção recomendada enquanto esperava.
- **Commits pequenos e rastreáveis**, com coautoria da IA declarada.

## O que fica para a próxima rodada

Itens que precisam de decisão humana estão no [roadmap](roadmap.md), separados do que o agente pode fazer sozinho.
