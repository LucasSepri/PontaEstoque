# Guia de Contribuição

Obrigado por considerar contribuir com o PontaEstoque! Este documento descreve como contribuir com o projeto.

## Código de Conduta

Seja respeitoso e profissional em todas as interações.

## Como Contribuir

1. **Fork** o repositório
2. **Crie uma branch** para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. **Commit** suas mudanças (`git commit -m 'feat: adiciona nova funcionalidade'`)
4. **Push** para a branch (`git push origin feature/nova-funcionalidade`)
5. **Abra um Pull Request**

## Padrões de Commit

Use Conventional Commits:
- `feat:` nova funcionalidade
- `fix:` correção de bug
- `docs:` documentação
- `style:` formatação
- `refactor:` refatoração
- `test:` testes
- `chore:` tarefas de manutenção

## Configuração do Ambiente

1. Copie `.env.example` para `.env.local`
2. Configure suas variáveis de ambiente
3. `npm install`
4. `npm run dev`

## Testes

Antes de enviar um PR, certifique-se de que:
- O código compila sem erros
- As funcionalidades existentes continuam funcionando
- O código segue o estilo do projeto

## Relatando Bugs

Use as Issues do GitHub com:
- Descrição clara do problema
- Passos para reproduzir
- Comportamento esperado vs atual
- Screenshots se aplicável
