# Estoque › Preços pagos

**Data:** 2026-09-24
**Status:** aguardando revisão do dono

## Problema

A clínica compra os ativos de laboratórios diferentes e não tem onde ver o que
pagou em cada compra. Sem isso, um aumento de preço só aparece na conta do mês, e
a precificação do que é vendido fica no escuro.

Hoje a entrada de estoque acontece de dois jeitos — foto/PDF da nota fiscal (a IA
lê os itens) e lançamento manual — e **nenhum dos dois registra valor pago nem
laboratório**.

## Contexto do código hoje

- `/estoque` já redireciona quem não é admin nem tem `can_estoque`. Em produção,
  isso é exatamente **Alexandre (admin), Francielle e Carlos** — nenhum outro
  usuário tem essas marcações. Não é preciso criar permissão nova.
- A leitura da nota (`POST /api/estoque/scan-nf`) extrai hoje `name`, `quantity`,
  `unit`, `lot`, `expiry_date`. O arquivo vai para o S3 e o texto da nota não
  volta para o navegador.
- Toda entrada vira um `stock_movements` com `type = 'entrada'`, criado só pela
  tela de Estoque (fluxo da NF e lançamento manual).
- **Cada item de estoque é um LOTE**, não um produto: o mesmo produto aparece em
  vários registros. Por isso o histórico de preço não pode ser por item.
- Dinheiro no projeto é guardado em centavos (inteiro). `reaisToCents` /
  `centsToReais` existem em `src/lib/training/money.ts`.

## Comportamento

### 1. Toda entrada exige valor pago e laboratório

Decisão do dono: **obrigatório**, sem exceção, nos dois caminhos.

- **Pela foto da nota:** a leitura passa a trazer, por item, o **valor unitário** e
  o **laboratório** (o fornecedor da nota). Na tela de conferência, cada linha
  ganha os campos "Valor unitário (R$)" e "Laboratório", já preenchidos quando a
  IA conseguiu ler e sempre editáveis. O botão de salvar fica bloqueado enquanto
  faltar valor ou laboratório em alguma linha, dizendo quais faltam.
- **No lançamento manual:** os mesmos dois campos, obrigatórios.
- **No servidor:** `POST /api/estoque/movements` com `type = 'entrada'` passa a
  exigir `unit_price_cents` (> 0) e `laboratory`; sem isso responde 400. A compra é
  gravada na mesma transação da entrada.
- Consequência aceita pelo dono: uma nota sem valor (bonificação, brinde,
  transferência) não pode ser lançada até alguém digitar um valor.

### 2. Aba "Preços" (5ª aba do Estoque)

Uma linha por **produto + laboratório** — a comparação escolhida pelo dono.

Cada linha mostra:

- produto e laboratório;
- **último valor pago** e a data da compra;
- **variação** sobre a compra anterior do mesmo produto no mesmo laboratório;
- quantidade e unidade daquela compra ("R$ 82,00 / frasco");
- ao abrir, o histórico completo daquele par, do mais recente para o mais antigo.

**Destaques da variação** (definidos pelo dono):

| Situação | Marca |
|---|---|
| aumento de 10% ou mais | 🔴 |
| aumento de 5% a menos de 10% | 🟡 |
| variação menor que 5%, para cima ou para baixo | cinza |
| queda de 5% ou mais | 🟢 |

Primeira compra de um par produto+laboratório não tem variação: aparece como
"primeira compra".

**Ordem:** maiores aumentos primeiro — o objetivo da aba é achar o que subiu.
Busca com lupa por produto ou laboratório, como nos relatórios de estoque.

### 3. Registro retroativo (notas antigas)

Botão **"Registrar preços de nota antiga"** dentro da aba Preços:

1. envia a foto/PDF da nota;
2. a IA lê itens, valores e laboratório;
3. você confere e corrige;
4. salva.

**Isso não mexe no estoque**: nenhum movimento de entrada é criado e nenhum item
de estoque é criado. É só histórico de preço, para haver referência na próxima
entrada de verdade.

A data da compra vem da nota quando a IA conseguir ler; senão, você escolhe.

### 4. O que é o "valor unitário"

É o valor de **uma unidade da nota** (frasco, caixa, ampola), ou seja, total
dividido pela quantidade. Guardamos também quantidade, unidade e total, e a
unidade aparece junto do preço.

Se a mesma compra vier em caixa numa vez e em frasco na outra, a variação fica
sem sentido. Nesse caso a linha mostra "unidade mudou: caixa → frasco" em vez de
um percentual.

### Fora do escopo

- Preço de venda, markup e precificação (isso é o módulo Financeiro).
- Total gasto por período, por laboratório ou curva ABC.
- Editar ou apagar um preço já registrado (a correção é registrar a compra certa).
- Trazer os preços para o relatório de Repor Estoque.
- Sugerir automaticamente o reajuste do preço de venda.

## Arquitetura

### Regras puras — `src/lib/precos.ts` (novo)

- `valorParaCentavos(texto)` → `number | null` (aceita "82,00", "R$ 82,00",
  "1.250,50"). Reaproveita `reaisToCents`, que hoje vive em
  `src/lib/training/money.ts`; o arquivo passa para `src/lib/money.ts` e o módulo
  de treinamento reexporta, para não quebrar nada.
- `chaveProduto(nome)` e `chaveLaboratorio(nome)` → usam `normalizarNome` de
  `src/lib/stock-actives.ts` (minúsculas, sem acento, pontuação virando espaço).
- `variacao(anteriorCentavos, atualCentavos)` → percentual (number) ou `null` na
  primeira compra.
- `nivelVariacao(pct)` → `'alta' | 'atencao' | 'estavel' | 'queda'` (10%, 5%).
- `validarCompra({ valor, laboratorio, quantidade })` → erros legíveis, usado pela
  tela e pela API.

### Banco — `src/lib/db.ts` (`runMigrations`)

```sql
CREATE TABLE IF NOT EXISTS stock_purchases (
  id SERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_key TEXT NOT NULL,
  laboratory TEXT NOT NULL,
  laboratory_key TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT,
  total_cents INTEGER,
  purchased_at DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('nf', 'manual', 'retroativo')),
  item_id INTEGER REFERENCES stock_items(id) ON DELETE SET NULL,
  movement_id INTEGER REFERENCES stock_movements(id) ON DELETE SET NULL,
  nf_s3_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_purchases_produto_idx
  ON stock_purchases (product_key, laboratory_key, purchased_at DESC);
```

`product_key` e `laboratory_key` são gravados no INSERT (não calculados na
leitura), para o agrupamento não mudar se a normalização mudar depois.

### Servidor — `src/lib/precos-db.ts` (novo)

- `registrarCompra(dados, tx?)` — aceita a transação da entrada.
- `listarPrecos()` — devolve, por produto+laboratório, a última compra, a
  anterior e o histórico; a variação é calculada nas regras puras.
- `registrarComprasRetroativas(lista)` — em transação.

### API

- `POST /api/estoque/movements` (`type = 'entrada'`): exige `unit_price_cents` e
  `laboratory`; grava a compra junto (`source: 'nf' | 'manual'`).
- `GET /api/estoque/precos` — lista para a aba.
- `POST /api/estoque/precos` — notas antigas (`source: 'retroativo'`), sem mexer
  no estoque.
- Todas exigem `canEstoqueSession()`. Quem lançou fica gravado na própria
  compra (`created_by`); o registro retroativo também vai para a auditoria.

### Leitura da nota — `src/app/api/estoque/scan-nf/route.ts`

O prompt da NF passa a pedir, além do que já pede: `unit_price` (valor unitário
como aparece na nota), `total_price`, `laboratory` (fornecedor/fabricante) e
`purchase_date`. Campos não encontrados voltam `null` — a tela cobra.

### Interface

- `src/app/estoque/PrecosTab.tsx` (novo): a aba, a busca, o histórico e o fluxo
  de nota antiga.
- `src/app/estoque/EstoqueClient.tsx`: 5ª aba; campos obrigatórios de valor e
  laboratório na conferência da NF e no lançamento manual.

### Testes

- Puros: `valorParaCentavos` (vírgula, ponto de milhar, "R$", lixo), `variacao`
  (inclusive queda e primeira compra), `nivelVariacao` nas fronteiras de 5% e 10%,
  `chaveProduto`/`chaveLaboratorio`, `validarCompra`.
- Componente: `PrecosTab` (ordem por maior aumento, destaques, busca, histórico,
  "primeira compra", "unidade mudou").
- Banco e rotas: sem harness no projeto; revisão de código e build.
- `EstoqueClient` é um arquivo grande e sem testes hoje: as mudanças dele entram
  por revisão, não por teste automatizado.
