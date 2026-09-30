# Almoxarifado UDV — DAV Ponta Grossa

Sistema web de controle de almoxarifado: **área pública de retirada** (`/retirada`, sem cadastro, pensada para celular) e **área administrativa** (`/admin`) com estoque, retiradas, devoluções, pendências, movimentações, relatórios, usuários e auditoria.

## Arquitetura (front + back separados, monorepo)

```
almoxarifado-udv/
├─ apps/
│  ├─ web/   → Next.js 15 + React + Tailwind      (Vercel)
│  └─ api/   → Express + Prisma + Zod + JWT       (Railway)
│     ├─ prisma/ (schema, migrations, seed)
│     └─ src/ config · lib (stock, protocol, audit, auth) · middleware · modules
├─ railway.json   (build/start/healthcheck da API)
└─ package.json   (workspaces)
```

O navegador só conversa com o domínio da Vercel. O Next repassa `/api/*` para a API no Railway (`rewrites`), então o cookie de sessão (httpOnly, Secure) é *first-party* — sem CORS/SameSite complicados.

### Consistência de estoque
- `Item.currentStock` só é alterado por **`applyMovement()`** (`apps/api/src/lib/stock.ts`), sempre dentro de `$transaction`.
- Saída = `UPDATE … WHERE currentStock >= qtd` (atômico, trava a linha). Duas retiradas simultâneas são serializadas pelo Postgres; a que não couber recebe *"Quantidade indisponível. Há apenas N unidades disponíveis."*
- `CHECK (currentStock >= 0)` no banco como última barreira.
- Toda alteração grava `StockMovement` (anterior/posterior/usuário/protocolo). Não há rota de exclusão de movimentações.
- Protocolos `RET-AAAAMMDD-XXXX` / `ENT-…` vêm de contador atômico (`ProtocolCounter`), fuso de Brasília.

### Perfis
`ADMIN` (tudo, usuários, auditoria) · `GESTOR` (estoque, retiradas, devoluções) · `CONSULTA` (somente leitura). Checado na API a cada requisição (usuário inativo perde acesso na hora).

## Desenvolvimento local

Requisitos: Node 20+ e PostgreSQL.

```bash
npm install
cp apps/api/.env.example apps/api/.env     # ajuste DATABASE_URL, JWT_SECRET (32+ chars), SEED_ADMIN_*
cp apps/web/.env.example apps/web/.env.local   # API_URL=http://localhost:4000
npm run db:migrate      # cria/aplica migrations (prisma migrate dev)
npm run db:seed         # admin + categorias + itens [DEV]
npm run dev             # api :4000 e web :3000
```

Usuário inicial = `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Itens de exemplo têm prefixo **[DEV]** / código `DEV-*` (desative com `SEED_SAMPLE_DATA=false`; em produção o seed recusa a senha padrão).

Scripts (raiz): `dev`, `build`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `db:seed`, `db:setup` (generate + migrate deploy + seed).

## Deploy

### 1. PostgreSQL no Railway
Novo projeto → **Add PostgreSQL**. Copie a `DATABASE_URL`.

### 2. API no Railway
Novo serviço a partir do repositório GitHub (raiz do repo — o `railway.json` já define build, start e healthcheck `/health`). Variáveis:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | referência ao Postgres do Railway |
| `JWT_SECRET` | string aleatória 32+ chars (`openssl rand -base64 48`) |
| `IP_HASH_SALT` | string aleatória |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | URL da Vercel, ex. `https://almoxarifado-udv.vercel.app` |
| `TRUST_PROXY_HOPS` | `2` (Vercel → Railway) |

O `start` executa `prisma migrate deploy` antes de subir (migrações de produção automáticas).
Primeiro acesso, uma vez: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (forte) e `SEED_SAMPLE_DATA=false`, depois rode `npm run db:seed -w apps/api` (Railway CLI: `railway run npm run db:seed -w apps/api`). Remova as variáveis `SEED_*` depois.

### 3. Web na Vercel
Importe o repositório, **Root Directory = `apps/web`**. Variável: `API_URL` = URL pública da API no Railway (sem barra final). Deploy.

### Checklist pós-deploy
- `https://<api>/health` → `{"status":"ok"}`
- `/retirada` abre e lista itens; `/admin/login` entra com o admin do seed
- Trocar a senha do admin em Usuários

## Privacidade (LGPD)
A tela pública pede só nome, data, item e quantidade, e expõe apenas nome/unidade/saldo dos itens liberados. O IP é guardado apenas como hash com sal (`requesterIpHash`), nunca em claro. Nenhum dado de outras pessoas aparece na área pública.

## Relatórios
Tela + exportação CSV (`;`, UTF-8 com BOM, com proteção contra injeção de fórmula). Os relatórios são montados em `modules/reports.ts` como `{title, columns, rows}` — para PDF basta adicionar outro formatador sobre o mesmo objeto.
