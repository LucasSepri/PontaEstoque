# Estratégia de conferência de ponta de estoque (pisos/revestimentos)

## Princípio

A conferência é o confronto entre **o que foi contado na loja** (`pontas.quantidade`) e **o saldo
disponível para venda do lote no ERP** (`pontas.estoque_erp`). A diferença só tem significado prático
quando expressa na unidade em que o operador trabalha: **caixas + m² avulsos**.

Medição no banco real:

| ponta | conferido | ERP (lote) | Δ | leitura |
|---|---|---|---|---|
| 33985 PISO 22X89 ELEGANCE (1,73 m²/cx) | 95,15 m² | 96,88 m² | **+1,73 m²** | ERP tem **1 caixa** a mais |
| 32434 PISO 34X34 PPF34010 (2,10 m²/cx) | 170,10 m² | 170,10 m² | 0 | confere |

Os dados já são buscados e gravados por `GET /api/pontas`. **A tela nunca os mostra** — o único bloco de
divergência usa `ponta.sistema`/`ponta.saldo_sistema`, colunas que não existem mais no banco, então
`sempre 0` e o bloco nunca renderiza ([app/sistema/page.tsx:1281](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/app/sistema/page.tsx:1281), [:2144](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/app/sistema/page.tsx:2144)).

## Fase 1 — Mostrar o que já existe (sem schema, sem rota nova) — FEITO

Só UI. Zero chamada extra ao ERP.

1. **Matar o bloco morto** de divergência: apagar `sistema`/`saldo_sistema` do type `Ponta` e do
   `CardPonta`. Divergência passa a ser `m2 - estoque_erp`.
2. **Badge de divergência no card**, em caixas e m²:
   - `confere` — Δ = 0
   - `sobra 1 cx (1,73 m²)` — ERP > conferido (m² saiu sem baixa)
   - `falta 2 cx (0,37 m²)` — conferido > ERP (contagem acima do lote)
   - `ERP não lido` — `estoque_erp == null`
3. **Métrica "ERP (lote)"** ao lado de "M² disponível" no card, com o lote ao lado do saldo.
4. **Frescor**: "sincronizado há 4 min" a partir de `sincronizado_em`; aviso quando > 10 min.
5. **KPIs de conferência** na faixa existente: `Divergentes` (nº) e `Δ m²` (soma absoluta).
6. **Filtro chip "Conferência"**: `Todos | Conferidas | Divergentes | Não lidas`.

## Fase 2 — Diagnóstico (usa rotas já existentes e cacheadas) — FEITO

7. **Detalhe do lote no card** via `/api/produto?tipo=estoque` (cacheado) + `/api/lotes`:
   - `situacao` do lote (`Liberado` / `Bloqueado`) — hoje o sync lê só `disponivel` e descarta isso;
   - quebra por filial 01–04 com `disponivel`, `reservado`, `transito`;
   - é o que **explica** a divergência: 1,73 m² reservado/em trânsito não é perda.

## Fase 3 — Modo conferência guiado (pendente)

8. **Tela de conferência sequencial** (`/conferencia` ou modal fullscreen):
   foto grande, lote, saldo ERP, metragem contada, caixas; botão "conferido" e "corrigir contagem";
   navegação anterior/próxima e barra de progresso. Ordena por maior divergência.
9. **`conferido_em timestamptz`** em `pontas` (via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
   idempotente) para registrar conferência aceita mesmo com divergência — sem isso uma divergência
   legítima fica pendente para sempre e a lista vira ruído.
10. **Ficha de conferência para impressão** (`@media print`) com os divergentes e o espaço de contagem.

## Correção de segurança de dados — FEITO

`app/api/pontas/route.ts` apaga a ponta quando o lote devolve 0 — mas `achar()` devolve 0 também
quando **o lote não é encontrado na lista do ERP** (lote renomeado/digitado errado). Isso apaga o
registro e a foto do usuário silenciosamente. Passar a distinguir `lote inexistente` (mantém e marca
"lote não encontrado") de `lote zerado` (apaga).

## Validação

- `scripts/check_conferencia.mjs` — 26 checagens assert-based: Δ em caixas/m² com os casos do banco
  real, borda da tolerância, `estoque_erp` como string do `pg`, faixas do frescor, lote não encontrado
  não deleta, e presença das classes CSS novas.
- `node scripts/check_cache_erp.mjs`, `npx tsc --noEmit`, `npm run build` — todos limpos.
- Conferido no navegador com os dois produtos reais: card 33985 mostra `Sobra no ERP +1,73 m² a mais
  no ERP (1 cx)`, ERP (lote 30798) 96,88 m² / 56 cx; card 32434 mostra `Confere`. KPIs `Divergentes 1`
  e `Δ conferência 1,73 m²`. O filtro de conferência conta 1 conferida e 1 sobra. O diagnóstico abre
  com lote 30798 / filial 01 / Liberado / 96,88 m² e a tabela das filiais 01–04.

## Arquivos

| arquivo | mudança |
|---|---|
| [app/sistema/page.tsx](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/app/sistema/page.tsx) | fases 1 e 2 no `CardPonta`/KPIs/filtros; fase 3 na tela de conferência |
| [app/sistema.css](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/app/sistema.css) | classes do badge de divergência, frescor e `@media print` |
| [app/api/pontas/route.ts](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/app/api/pontas/route.ts) | correção do lote não encontrado (fase 2); `conferido_em` (fase 3) |
| [lib/conferencia.ts](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/lib/conferencia.ts) | `divergencia()`, `caixasDe()`, `frescorSync()`, `DIVERGENCIA_INFO` |
| [scripts/check_conferencia.mjs](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/scripts/check_conferencia.mjs) | checagens assert-based |
| [lib/db.ts](/home/sepriano/Desktop/Desenvolvimento/PontaEstoque/lib/db.ts) | `pontaConferir()` e o `ALTER TABLE` idempotente (fase 3) |
