# Ponta de Estoque

Controle de estoque de pontas (solda) integrado ao ERP. Next.js 14 (App Router) + Postgres.

## Requisitos

- Node.js 20+ (testado no 24)
- Docker (só para o banco local) — ou um Postgres acessível

## 1. Banco de dados

Sobe um Postgres local com usuário e banco usados pelo app:

```bash
docker run -d --name ponta-dev-pg \
  -e POSTGRES_DB=ponta_estoque \
  -e POSTGRES_USER=ponta_app \
  -e POSTGRES_PASSWORD=senha \
  -p 5432:5432 postgres:17
```

Já existe o dump em `backup/dump_ponta_estoque.sql`. Para restaurar:

```bash
docker exec -i ponta-dev-pg psql -U ponta_app -d ponta_estoque < backup/dump_ponta_estoque.sql
```

Fotos: as fotos de produto ficam em `fotos/` na raiz e são servidas pela rota
`app/fotos/[nome]/route.ts`. **Não** voltam para `public/`: o `next start` serve
`public/` de um retrato tirado no boot, e todo upload gravado depois do start
voltaria 404 até o processo reiniciar.

Em produção, veja `backup/MIGRACAO_VPS.md`.

## 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e ajuste as variáveis:

```bash
cp .env.example .env.local
```

Veja `.env.example` para a lista completa de variáveis.

| Variável | Uso | Padrão |
|---|---|---|
| `DATABASE_URL` | Conexão Postgres (tabelas `pontas`, `imagens`) | `postgres://USUARIO:SENHA@localhost:5432/nome_do_banco` |
| `ERP_URL` | Endereço do ERP (App Server - porta 9999) | `http://SEU_IP_OU_DOMINIO:9999` |
| `API_URL` | Endereço da API (API Server - porta 9990) | `http://SEU_IP_OU_DOMINIO:9990` |
| `ERP_TIMEOUT` | Timeout das chamadas ao ERP (ms) | `25000` |
| `ERP_CACHE_TTL` | TTL do cache de leitura do ERP (ms) | `120000` |

## Arquitetura Dual-Server

O sistema MicroUniverso Vendas expõe dois servidores independentes:

| Servidor | Porta | Autenticação | Uso |
|---|---|---|---|
| **App Server** | 9999 | Cookie `ASP.NET_SessionId` | Login, consulta de produtos, lotes, pontas, upload |
| **API Server** | 9990 | Bearer Token (extraído do HTML) | Grid, orçamentos, clientes, vendedores, cupons, agentes, atendimentos |

- O token da API (servidor 9990) é **diferente** do token do app (servidor 9999)
- Após login bem-sucedido no App Server, o token da API é extraído automaticamente do HTML da home page via regex `token:\s*'([^']+)'`
- O token é armazenado em memória (`globalThis`) e renovado automaticamente em caso de expiração
- Todas as chamadas ao API Server usam `Authorization: Bearer {apiToken}`

## 3. Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000` (usa 3001 se a 3000 estiver ocupada).

Produção:

```bash
npm run build
npm start
```

## Fluxo

1. `/` — login (valida no ERP)
2. `/sistema` — busca de pontas, apontamento de lotes, upload de fotos

## Documentação Complementar

Os seguintes arquivos no repositório contêm detalhes de engenharia reversa do ERP:

| Arquivo | Conteúdo |
|---|---|
| `API_ENDPOINTS_SUMMARY.md` | Lista de 519 endpoints descobertos no bundle JS do ERP |
| `REVERSE_ENGINEERING_REPORT.md` | Relatório completo de análise do site MicroUniverso Vendas |

## Autenticação com o ERP

O ERP é ASP.NET e autentica por cookie `ASP.NET_SessionId`; `lib/erp.ts` faz
o login, guarda o cookie e o reenvia. Resposta em HTML = sessão expirada (o ERP
não devolve 401).

**Dois servidores, dois tokens:**

| Servidor | Porta | Autenticação | Uso |
|---|---|---|---|
| **App Server** | 9999 | Cookie `ASP.NET_SessionId` | Login, consulta de produtos, lotes, pontas, upload |
| **API Server** | 9990 | Bearer Token (extraído do HTML) | Grid, orçamentos, clientes, vendedores, cupons, agentes, atendimentos |

- O token da API (servidor 9990) é **diferente** do token do app (servidor 9999)
- Após login bem-sucedido no App Server, o token da API é extraído automaticamente
  do HTML da home page via regex `token:\s*'([^']+)'`
- O token é armazenado em memória (`globalThis`) e renovado automaticamente em caso de expiração
- Todas as chamadas ao API Server usam `Authorization: Bearer {apiToken}`

## Notas

- O backend inteiro é o Next (rotas em `app/api/`).
  Arquivos `.py` antigos podem ter existido como referência, mas não estão
  mais no repositório — o código atual é 100% TypeScript.
- Sessão em memória (`lib/erp.ts`): single-user, reinicia ao reiniciar o app.
- Fotos em disco (`fotos/` na raiz), servidas por `app/fotos/[nome]/route.ts`.
  Fora do `public/` de propósito: o retrato de `public/` que o `next start` faz
  no boot faria todo upload posterior devolver 404.
- Lógica compartilhada fica em `lib/` — import entre arquivos `route.ts` não funciona.
- Backup: `pg_dump ponta_estoque > backup_$(date +%F).sql`
