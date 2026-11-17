# Como contribuir

Obrigado por querer ajudar! O Proxinho é um projeto pequeno e gratuito para a comunidade brasileira.

## Antes de começar

1. Leia o [AGENTS.md](AGENTS.md): ele tem os comandos, o mapa do código e as regras do projeto.
2. Para mudanças grandes, abra uma issue antes, explicando o problema.
3. Mudança de arquitetura vem com um ADR novo em `docs/adr/`.

## Fluxo

```bash
git switch -c minha-mudanca
pnpm install
pnpm db:seed:local
pnpm dev
# ... mudanças + testes ...
pnpm check
pnpm test:e2e
```

Abra o pull request. A CI roda tudo e, se você tiver acesso ao repositório, publica uma prévia com link no PR.

## Padrões

- Português do Brasil no código, nos comentários e nos textos da interface.
- Commits no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`...).
- Toda mudança de comportamento vem com teste.
- Interface acessível (WCAG 2.2 AA) e conferida no celular.

## Traduções erradas

Se o texto de uma carta está errado, abra uma issue com o nome da carta, o texto que aparece e a fonte do texto correto. Nunca usamos tradução automática.
