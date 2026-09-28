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
  -e POSTGRES_PASSWORD=dev123 \
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

Crie/edite `.env.local` na raiz:

```
DATABASE_URL=postgres://ponta_app:dev123@localhost:5432/ponta_estoque
ERP_URL=http://177.185.46.243:9999
ERP_TIMEOUT=25000
```

| Variável | Uso | Padrão |
|---|---|---|
| `DATABASE_URL` | Conexão Postgres (tabelas `pontas`, `imagens`) | `postgres://ponta_app:senha@localhost:5432/ponta_estoque` |
| `ERP_URL` | Endereço do ERP | `http://177.185.46.243:9999` |
| `ERP_TIMEOUT` | Timeout das chamadas ao ERP (ms) | `25000` |

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

## Notas

- **Não precisa de Python.** O backend inteiro é o Next (rotas em `app/api/`). O
  `servidor_teste.py` da raiz do workspace é a versão antiga, mantida só como
  referência de quais endpoints o ERP aceita — não é executado.
- O ERP é ASP.NET e autentica por cookie `ASP.NET_SessionId`; `lib/erp.ts` faz
  o login, guarda o cookie e o reenvia. Resposta em HTML = sessão expirada (o ERP
  não devolve 401).
- Sessão em memória (`lib/erp.ts`): single-user, reinicia ao reiniciar o app.
- Fotos em disco (`fotos/` na raiz), servidas por `app/fotos/[nome]/route.ts`.
  Fora do `public/` de propósito: o retrato de `public/` que o `next start` faz
  no boot faria todo upload posterior devolver 404.
- Lógica compartilhada fica em `lib/` — import entre arquivos `route.ts` não funciona.
- Backup: `pg_dump ponta_estoque > backup_$(date +%F).sql`
