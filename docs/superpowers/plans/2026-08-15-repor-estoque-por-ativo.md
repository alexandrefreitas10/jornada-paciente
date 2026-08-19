# Repor Estoque por ativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No relatório "Repor Estoque", somar os lotes de um mesmo ativo numa linha só e aplicar limite de 30 unidades a 22 ativos escolhidos; o resto continua em 5.

**Architecture:** Um módulo puro (`stock-actives.ts`) guarda o catálogo de ativos com seus padrões de nome e seu limite, normaliza os nomes e faz o agrupamento. O `RelatoriosTab` só consome o resultado. A aba Estoque Atual não é tocada.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-08-15-repor-estoque-por-ativo-design.md](../specs/2026-08-15-repor-estoque-por-ativo-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/stock-actives.ts` | **Novo.** Catálogo dos ativos, normalização, busca e agrupamento. Puro — sem banco, sem React. É o que os testes cobrem. |
| `__tests__/lib/stock-actives.test.ts` | **Novo.** |
| `src/lib/stock.ts` | `listStockItems` ganha `{ incluirZerados }` — a lista de compra precisa ver o que zerou. |
| `src/app/api/estoque/items/route.ts` | Aceita `?zerados=1`. Sem o parâmetro nada muda. |
| `src/app/estoque/RelatoriosTab.tsx` | Busca a lista com zerados, consome o agrupamento, exibe o limite por linha. |

`src/app/estoque/EstoqueClient.tsx` **não é tocado** — a régua de 5 por lote na aba Estoque Atual continua.

`npx jest` tem **4 suítes que já falhavam antes deste trabalho** (`task-definitions`, `task-completions`, `patients`, `PatientCard`) e `tsc` tem erros pré-existentes em `__tests__/components/PatientCard.test.tsx`. Ignore — só não piore.

---

## Task 1: Catálogo de ativos e agrupamento

**Files:**
- Create: `src/lib/stock-actives.ts`
- Test: `__tests__/lib/stock-actives.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/stock-actives.test.ts`:

```typescript
// __tests__/lib/stock-actives.test.ts
import {
  ATIVOS, LIMITE_PADRAO, LIMITE_CONTROLADO,
  normalizarNome, acharAtivo, agruparParaReposicao,
} from '@/lib/stock-actives'

describe('stock-actives — normalização', () => {
  it('colapsa acento, pontuação, caixa e espaço', () => {
    const esperado = 'pool cognicao 2ml'
    expect(normalizarNome('POOL COGNICAO 2ML')).toBe(esperado)
    expect(normalizarNome('POOL COGNICAO - 2ML')).toBe(esperado)
    expect(normalizarNome('  Pool  Cognição   2ml ')).toBe(esperado)
  })

  it('trata parênteses, barra, vírgula e porcentagem como separador', () => {
    expect(normalizarNome('NAC (N-acetilcisteína)')).toBe('nac n acetilcisteina')
    expect(normalizarNome('HIDROXIMETILBUTIRATO 2,5% 2ML')).toBe('hidroximetilbutirato 2 5 2ml')
    expect(normalizarNome('Vitamina C 20% (1 g/5 mL)')).toBe('vitamina c 20 1 g 5 ml')
  })
})

describe('stock-actives — catálogo', () => {
  it('todo ativo tem nome, limite controlado e pelo menos um padrão', () => {
    expect(ATIVOS.length).toBeGreaterThan(0)
    for (const a of ATIVOS) {
      expect(a.nome.trim()).not.toBe('')
      expect(a.limite).toBe(LIMITE_CONTROLADO)
      expect(a.padroes.length).toBeGreaterThan(0)
    }
  })

  it('os nomes dos ativos são únicos', () => {
    expect(new Set(ATIVOS.map(a => a.nome)).size).toBe(ATIVOS.length)
  })

  it('o limite controlado é 30 e o padrão é 5', () => {
    expect(LIMITE_CONTROLADO).toBe(30)
    expect(LIMITE_PADRAO).toBe(5)
  })
})

describe('stock-actives — reconhecimento de nomes reais do estoque', () => {
  // Todos estes nomes existem hoje no banco de produção.
  const casos: [string, string][] = [
    ['HMB', 'HMB'],
    ['HIDROXIMETILBUTIRATO 2,5% 2ML', 'HMB'],
    ['NAC (N-acetilcisteína)', 'NAC'],
    ['N-Acetilcisteína', 'NAC'],
    ['POOL COGNICAO 2ML', 'Pool Cognição'],
    ['POOL COGNICAO - 2ML', 'Pool Cognição'],
    ['METILCOBALAMINA 2500MCG/1ML', 'Metilcobalamina'],
    ['Metilcobalamina 500 mcg', 'Metilcobalamina'],
    ['Coenzima Q10', 'Coenzima Q10'],
    ['COENZIMA Q10 100MG/1ML', 'Coenzima Q10'],
    ['L-Carnitina', 'L-carnitina'],
    ['L-BAIBA 150MG - 2ML', 'L-baiba'],
    ['L-BAIBA 150MG 2ML', 'L-baiba'],
    ['Pool de Minerais', 'Pool de Minerais'],
    ['POOL MINERAIS 2ML', 'Pool de Minerais'],
    ['Pool de Aminoácidos', 'Pool de Aminoácidos'],
    ['POOL DE AMINOACIDOS 5ML', 'Pool de Aminoácidos'],
    ['Pool de Aminoácidos Essenciais', 'Pool de Aminoácidos'],
    ['Pool Coenzimático', 'Pool Coenzimático'],
    ['COMPLEXO B (COM B1) 1ML', 'Complexo B com B1'],
    ['Complexo B sem B1', 'Complexo B sem B1'],
    ['Curcumina', 'Curcumina'],
    ['Pill food', 'Pill Food'],
    ['Resveratrol 100 mg', 'Resveratrol'],
  ]

  it.each(casos)('%s → %s', (nome, ativoEsperado) => {
    expect(acharAtivo(nome)?.nome).toBe(ativoEsperado)
  })
})

describe('stock-actives — separações que o dono pediu explicitamente', () => {
  it('as duas Vitaminas C são ativos DIFERENTES', () => {
    const a = acharAtivo('Vitamina C 440 mg')?.nome
    const b = acharAtivo('Vitamina C 20% (1 g/5 mL)')?.nome
    expect(a).toBe('Vitamina C 440 mg')
    expect(b).toBe('Vitamina C 20%')
    expect(a).not.toBe(b)
  })

  it('Magnésio 400 mg não se mistura com Sulfato de Magnésio', () => {
    expect(acharAtivo('Magnésio 400 mg')?.nome).toBe('Magnésio 400 mg')
    expect(acharAtivo('Sulfato de Magnésio')?.nome).toBe('Sulfato de Magnésio')
    expect(acharAtivo('Sulfato de Magnésio 10% (5 mL)')?.nome).toBe('Sulfato de Magnésio')
  })

  it('PRECEDÊNCIA: as três Vitaminas D 600 não se capturam entre si', () => {
    // O padrão da D600 pura casaria com "+ K2" e com "ADEK" se fosse testado antes.
    expect(acharAtivo('Vitamina D 600 UI')?.nome).toBe('Vitamina D 600 UI')
    expect(acharAtivo('Vitamina D 600 UI + K2')?.nome).toBe('Vitamina D 600 UI + K2')
    expect(acharAtivo('Vitamina D 600 ADEK')?.nome).toBe('Vitamina D 600 ADEK')
  })
})

describe('stock-actives — o que fica de fora', () => {
  it.each([
    ['Vitamina D 300 UI'],   // não está na lista do dono
    ['Selênio'],
    ['Lidocaína'],
    ['Tirzepartida BioMeds'],
    ['Implante Testosterona 200 mg'],
  ])('%s não pertence a nenhum ativo controlado', nome => {
    expect(acharAtivo(nome)).toBeNull()
  })
})

describe('stock-actives — agrupamento', () => {
  const item = (id: number, name: string, quantity: number) =>
    ({ id, name, quantity, unit: 'un', lot: null, expiry_date: null })

  it('soma os lotes do mesmo ativo numa linha só', () => {
    const linhas = agruparParaReposicao([
      item(1, 'HMB', 0),
      item(2, 'HMB', 0),
      item(3, 'HIDROXIMETILBUTIRATO 2,5% 2ML', 21),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('HMB')
    expect(linhas[0].quantidade).toBe(21)
    expect(linhas[0].registros).toBe(3)
    expect(linhas[0].limite).toBe(30)
  })

  it('lote e validade só aparecem quando a linha é de um registro só', () => {
    const um = agruparParaReposicao([
      { id: 1, name: 'Resveratrol 100 mg', quantity: 7, unit: 'un', lot: 'L1', expiry_date: '01/2027' },
    ])
    expect(um[0].lot).toBe('L1')
    expect(um[0].expiry_date).toBe('01/2027')

    const varios = agruparParaReposicao([
      { id: 1, name: 'Curcumina', quantity: 8, unit: 'un', lot: 'L1', expiry_date: '01/2027' },
      { id: 2, name: 'Curcumina', quantity: 13, unit: 'un', lot: 'L2', expiry_date: '02/2027' },
    ])
    expect(varios[0].lot).toBeNull()
    expect(varios[0].expiry_date).toBeNull()
  })

  it('item fora do catálogo vira uma linha sozinha, com limite 5', () => {
    const linhas = agruparParaReposicao([item(9, 'Selênio', 24)])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('Selênio')
    expect(linhas[0].limite).toBe(5)
    expect(linhas[0].registros).toBe(1)
  })

  it('nenhum registro é contado em dois ativos', () => {
    const entrada = [
      item(1, 'Vitamina D 600 UI', 29),
      item(2, 'Vitamina D 600 UI + K2', 30),
      item(3, 'Vitamina D 600 ADEK', 13),
    ]
    const linhas = agruparParaReposicao(entrada)
    const somaRegistros = linhas.reduce((s, l) => s + l.registros, 0)
    expect(somaRegistros).toBe(entrada.length)
    expect(linhas).toHaveLength(3)
  })

  it('lista vazia devolve lista vazia, não estoura', () => {
    expect(agruparParaReposicao([])).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest __tests__/lib/stock-actives.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stock-actives'`

- [ ] **Step 3: Implementar**

Criar `src/lib/stock-actives.ts`:

```typescript
// Ativos que a clínica controla de perto. Os registros de estoque são LOTES —
// o mesmo ativo aparece em vários, de propósito, e assim continua na aba
// Estoque Atual. Este módulo existe só para o relatório de reposição, onde
// olhar lote a lote faz o sistema mentir: hoje ele pede HMB duas vezes
// alegando estoque zero, com 21 unidades em "HIDROXIMETILBUTIRATO 2,5% 2ML".

export const LIMITE_PADRAO = 5
export const LIMITE_CONTROLADO = 30

export interface AtivoControlado {
  nome: string
  limite: number
  padroes: RegExp[]
}

// Minúsculas, sem acento, e qualquer coisa que não seja letra ou número vira
// espaço. É o que faz "POOL COGNICAO - 2ML" e "Pool Cognição 2ml" caírem no
// mesmo lugar sem precisar de uma entrada para cada variação.
export function normalizarNome(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')   // tira os acentos que o NFD separou
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// A ORDEM IMPORTA: o mais específico vem primeiro. Se "vitamina d 600 ui"
// fosse testado antes, engoliria "vitamina d 600 ui k2" e "vitamina d 600 adek".
export const ATIVOS: AtivoControlado[] = [
  { nome: 'Vitamina D 600 UI + K2', limite: LIMITE_CONTROLADO, padroes: [/vitamina d 600 ui k2/] },
  { nome: 'Vitamina D 600 ADEK', limite: LIMITE_CONTROLADO, padroes: [/vitamina d 600 adek/, /\badek\b/] },
  { nome: 'Vitamina D 600 UI', limite: LIMITE_CONTROLADO, padroes: [/vitamina d 600 ui/] },

  { nome: 'Vitamina C 440 mg', limite: LIMITE_CONTROLADO, padroes: [/vitamina c 440/] },
  { nome: 'Vitamina C 20%', limite: LIMITE_CONTROLADO, padroes: [/vitamina c 20\b/] },

  // Sais diferentes, compras diferentes — decisão do dono.
  { nome: 'Sulfato de Magnésio', limite: LIMITE_CONTROLADO, padroes: [/sulfato de magnesio/] },
  { nome: 'Magnésio 400 mg', limite: LIMITE_CONTROLADO, padroes: [/magnesio 400/] },

  { nome: 'HMB', limite: LIMITE_CONTROLADO, padroes: [/\bhmb\b/, /hidroximetilbutirato/] },
  { nome: 'NAC', limite: LIMITE_CONTROLADO, padroes: [/\bnac\b/, /acetilcisteina/] },
  { nome: 'L-carnitina', limite: LIMITE_CONTROLADO, padroes: [/\bl carnitina\b/, /\blcarnitina\b/] },
  { nome: 'L-baiba', limite: LIMITE_CONTROLADO, padroes: [/baiba/] },
  { nome: 'Metilcobalamina', limite: LIMITE_CONTROLADO, padroes: [/metilcobalamina/] },
  { nome: 'Coenzima Q10', limite: LIMITE_CONTROLADO, padroes: [/coenzima q\s?10/, /\bcoq10\b/] },
  { nome: 'Curcumina', limite: LIMITE_CONTROLADO, padroes: [/curcumina/] },
  { nome: 'Pill Food', limite: LIMITE_CONTROLADO, padroes: [/pill food/] },
  { nome: 'Resveratrol', limite: LIMITE_CONTROLADO, padroes: [/resveratrol/] },

  { nome: 'Complexo B com B1', limite: LIMITE_CONTROLADO, padroes: [/complexo b com b1/] },
  { nome: 'Complexo B sem B1', limite: LIMITE_CONTROLADO, padroes: [/complexo b sem b1/] },

  { nome: 'Pool Cognição', limite: LIMITE_CONTROLADO, padroes: [/pool cognicao/, /pool cognitivo/] },
  { nome: 'Pool Coenzimático', limite: LIMITE_CONTROLADO, padroes: [/pool coenzimatico/] },
  { nome: 'Pool de Aminoácidos', limite: LIMITE_CONTROLADO, padroes: [/pool de aminoacidos/, /pool aminoacidos/] },
  { nome: 'Pool de Minerais', limite: LIMITE_CONTROLADO, padroes: [/pool de minerais/, /pool minerais/] },
]

export function acharAtivo(nome: string): AtivoControlado | null {
  const n = normalizarNome(nome)
  if (!n) return null
  return ATIVOS.find(a => a.padroes.some(p => p.test(n))) ?? null
}

// O que o relatório precisa de cada item de estoque. Deliberadamente mínimo:
// o módulo não conhece o resto do StockItem.
export interface ItemParaAgrupar {
  id: number
  name: string
  quantity: number
  unit: string
  lot: string | null
  expiry_date: string | null
}

export interface LinhaReposicao {
  chave: string
  nome: string
  quantidade: number
  unit: string
  limite: number
  registros: number
  // Só fazem sentido quando a linha veio de um registro só: somados vários
  // lotes, exibir o lote de um deles seria informação errada.
  lot: string | null
  expiry_date: string | null
}

export function agruparParaReposicao(items: ItemParaAgrupar[]): LinhaReposicao[] {
  const porChave = new Map<string, LinhaReposicao>()

  for (const item of items) {
    const ativo = acharAtivo(item.name)
    const chave = ativo ? `ativo:${ativo.nome}` : `item:${item.id}`
    const existente = porChave.get(chave)

    if (!existente) {
      porChave.set(chave, {
        chave,
        nome: ativo ? ativo.nome : item.name.trim(),
        quantidade: item.quantity,
        unit: item.unit,
        limite: ativo ? ativo.limite : LIMITE_PADRAO,
        registros: 1,
        lot: item.lot,
        expiry_date: item.expiry_date,
      })
      continue
    }

    existente.quantidade += item.quantity
    existente.registros += 1
    existente.lot = null
    existente.expiry_date = null
  }

  return [...porChave.values()]
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest __tests__/lib/stock-actives.test.ts`
Expected: PASS

- [ ] **Step 5: Conferir contra o estoque real**

Os padrões foram escritos a partir dos nomes que existem hoje em produção — vale
confirmar que nenhum ficou órfão e que nenhum caiu no ativo errado.

Criar `scripts/conferir-ativos.ts` (temporário, apagado no fim deste passo):

```typescript
import postgres from 'postgres'
import { acharAtivo } from '../src/lib/stock-actives'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 })
const rows = await sql<{ name: string; quantity: number }[]>`
  SELECT name, quantity FROM stock_items ORDER BY lower(name)
`
for (const r of rows) {
  const ativo = acharAtivo(r.name)
  console.log(`${(ativo?.nome ?? '(fora do catalogo)').padEnd(26)} | ${String(r.quantity).padStart(4)} | ${r.name}`)
}
await sql.end()
```

Run: `npx tsx --env-file=.env.local scripts/conferir-ativos.ts`

Leia a saída inteira e confira duas coisas:

1. Todo nome que **deveria** pertencer a um ativo da spec aparece com o ativo na
   primeira coluna — nenhum caiu em `(fora do catalogo)` por engano.
2. Nenhum nome caiu no ativo **errado** — em especial as três Vitaminas D 600,
   as duas Vitaminas C e os dois magnésios.

Se achar um nome descoberto, acrescente o padrão **e** um caso no teste de
reconhecimento (Step 1). **Não** relaxe um padrão existente para caber — padrão
largo demais captura o ativo errado.

Apagar o script: `rm scripts/conferir-ativos.ts`


- [ ] **Step 6: Commit**

```bash
git add src/lib/stock-actives.ts __tests__/lib/stock-actives.test.ts && git commit -m "feat(estoque): catalogo de ativos controlados e agrupamento por ativo"
```

---

## Task 2: A lista de compra passa a enxergar os zerados

**Descoberto durante a execução, contra o banco real:** `listStockItems` termina com
`HAVING COALESCE(...) <> 0`, então **item com saldo exatamente zero não chega em
tela nenhuma**. Isso foi decidido de propósito para a aba Estoque Atual
("esgotado é normal"), mas numa lista de compra é o contrário: L-carnitina
(3 lotes, todos zerados) e Magnésio 400 mg (zerado) são justamente os dois
ativos que o dono precisa comprar, e eram os únicos dos 22 que não apareceriam.

O dono decidiu: **os 22 ativos controlados aparecem mesmo zerados; os demais
itens continuam sumindo quando zeram.** A aba Estoque Atual não muda.

**Files:**
- Modify: `src/lib/stock.ts:32`
- Modify: `src/app/api/estoque/items/route.ts:8`

Não há harness de teste para banco ou rota neste projeto — a verificação deste
task é por consulta real, no Step 3.

- [ ] **Step 1: `listStockItems` aceita incluir os zerados**

Em `src/lib/stock.ts`, trocar a assinatura e o `HAVING`. O corpo do SELECT não muda.

De:

```typescript
export async function listStockItems(): Promise<StockItem[]> {
  await initSchema()
  const rows = await sql<StockItem[]>`
```

para:

```typescript
// incluirZerados: a aba Estoque Atual esconde saldo zero de propósito
// ("esgotado é normal" — ver o HAVING abaixo). A lista de compra do relatório
// precisa do contrário: o que zerou é o que mais importa comprar.
export async function listStockItems(opts?: { incluirZerados?: boolean }): Promise<StockItem[]> {
  await initSchema()
  const incluirZerados = opts?.incluirZerados ?? false
  const rows = await sql<StockItem[]>`
```

E trocar o bloco `HAVING`. De:

```typescript
    -- Esconde apenas os zerados (esgotado é normal). Saldo NEGATIVO aparece
    -- para o operador ver e corrigir, em vez de sumir silenciosamente.
    HAVING COALESCE(
      SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) -
      SUM(CASE WHEN m.type = 'saida'   THEN m.quantity ELSE 0 END),
      0
    ) <> 0
```

para:

```typescript
    -- Esconde apenas os zerados (esgotado é normal). Saldo NEGATIVO aparece
    -- para o operador ver e corrigir, em vez de sumir silenciosamente.
    HAVING ${incluirZerados}::boolean OR COALESCE(
      SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) -
      SUM(CASE WHEN m.type = 'saida'   THEN m.quantity ELSE 0 END),
      0
    ) <> 0
```

O `::boolean` não é decorativo: sem ele o Postgres recebe o parâmetro como
`unknown` e recusa o `OR`.

Os dois chamadores existentes (`src/app/api/estoque/items/route.ts:9` e
`src/app/api/estoque/report/route.ts:17`) chamam sem argumento e continuam
recebendo a lista sem zerados. Não os altere — só o de `items` ganha o parâmetro,
no Step 2.

- [ ] **Step 2: A rota aceita `?zerados=1`**

Em `src/app/api/estoque/items/route.ts`, substituir o GET.

De:

```typescript
export async function GET() {
  const items = await listStockItems()
  return NextResponse.json(items)
}
```

para:

```typescript
// ?zerados=1 é usado só pelo relatório "Repor Estoque". Sem o parâmetro o
// comportamento é o de sempre — todas as outras telas continuam sem os zerados.
export async function GET(req: NextRequest) {
  const incluirZerados = req.nextUrl.searchParams.get('zerados') === '1'
  const items = await listStockItems({ incluirZerados })
  return NextResponse.json(items)
}
```

`NextRequest` já está importado no topo do arquivo (é usado pelo `POST`).

- [ ] **Step 3: Verificar contra o banco real**

Criar `conferir.mts` na raiz do projeto (temporário):

```typescript
import { listStockItems } from './src/lib/stock.ts'

const semZerados = await listStockItems()
const comZerados = await listStockItems({ incluirZerados: true })

console.log('sem zerados:', semZerados.length)
console.log('com zerados:', comZerados.length)
console.log('zerados a mais:', comZerados.filter(i => i.quantity === 0).length)
console.log('')
for (const i of comZerados.filter(i => i.quantity === 0)) console.log('  0 →', i.name)
process.exit(0)
```

Run: `node --env-file=.env.local conferir.mts`

Esperado: `sem zerados` menor que `com zerados`; a lista dos zerados inclui
`L-Carnitina` (três vezes) e `Magnésio 400 mg`. Se a consulta estourar com erro
de tipo no `HAVING`, o `::boolean` do Step 1 não foi aplicado.

Apagar o script: `rm conferir.mts`

- [ ] **Step 4: Verificar que nada mais quebrou**

Run: `npx tsc --noEmit && npx jest`
Expected: nenhum erro novo; as 4 suítes vermelhas continuam sendo só as
pré-existentes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stock.ts src/app/api/estoque/items/route.ts && git commit -m "feat(estoque): lista de itens pode incluir os zerados, sob parametro"
```

---

## Task 3: Relatório usa o agrupamento

**Ajustado depois da revisão do Task 2.** Agora que os lotes zerados chegam ao
relatório, `agruparParaReposicao` precisa parar de tratá-los como cadastro: um
lote vazio não é um lote que você tem. Sem isso, quase todo ativo perderia o
Lote e a Validade na tela — Pool Cognição, HMB, Metilcobalamina, Coenzima Q10,
Curcumina, Complexo B sem B1, Pool Coenzimático, Pool de Minerais, L-baiba e
Pill Food têm todos exatamente um lote com saldo e um ou mais zerados, e todos
passariam a exibir "N cadastros somados" no lugar do lote.

**Files:**
- Modify: `src/lib/stock.ts:51` e `src/app/api/estoque/items/route.ts:8` (dois comentários)
- Modify: `src/lib/stock-actives.ts`
- Test: `__tests__/lib/stock-actives.test.ts`
- Modify: `src/app/estoque/RelatoriosTab.tsx`

- [ ] **Step 1: Corrigir dois comentários que o Task 2 deixou desatualizados**

Em `src/lib/stock.ts`, a linha 51 afirma sem ressalva que a consulta esconde os
zerados, logo acima da linha que deixou de fazer isso quando o parâmetro vem
ligado. Trocar:

```sql
    -- Esconde apenas os zerados (esgotado é normal). Saldo NEGATIVO aparece
```

por:

```sql
    -- Esconde os zerados, salvo quando incluirZerados (esgotado é normal).
    -- Saldo NEGATIVO aparece
```

Em `src/app/api/estoque/items/route.ts:8`, trocar "é usado só pelo relatório"
por "existe para o relatório" — a rota não tem como garantir exclusividade, e a
frase envelhece mal:

```typescript
// ?zerados=1 existe para o relatório "Repor Estoque". Sem o parâmetro o
// comportamento é o de sempre — todas as outras telas continuam sem os zerados.
```

- [ ] **Step 2: Escrever os testes que falham**

Em `__tests__/lib/stock-actives.test.ts`, no describe `'stock-actives — agrupamento'`,
**substituir** o teste `'soma os lotes do mesmo ativo numa linha só'`:

```typescript
  it('soma os lotes do mesmo ativo numa linha só', () => {
    const linhas = agruparParaReposicao([
      item(1, 'HMB', 0),
      item(2, 'HMB', 0),
      item(3, 'HIDROXIMETILBUTIRATO 2,5% 2ML', 21),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('HMB')
    expect(linhas[0].quantidade).toBe(21)
    expect(linhas[0].registros).toBe(3)
    expect(linhas[0].limite).toBe(30)
  })
```

por:

```typescript
  it('soma os lotes do mesmo ativo numa linha só', () => {
    // Caso real: o relatório pedia HMB duas vezes alegando saldo zero,
    // com 21 unidades num cadastro escrito por extenso.
    const linhas = agruparParaReposicao([
      item(1, 'HMB', 0),
      item(2, 'HMB', 0),
      item(3, 'HIDROXIMETILBUTIRATO 2,5% 2ML', 21),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('HMB')
    expect(linhas[0].quantidade).toBe(21)
    expect(linhas[0].limite).toBe(30)
    // Os dois cadastros vazios não contam: quem tem saldo é um só.
    expect(linhas[0].registros).toBe(1)
  })
```

E **acrescentar** ao mesmo describe:

```typescript
  it('lote vazio nao apaga o lote e a validade de quem tem saldo', () => {
    const linhas = agruparParaReposicao([
      { id: 1, name: 'POOL COGNICAO - 2ML', quantity: 0, unit: 'un', lot: 'VELHO', expiry_date: '01/2025' },
      { id: 2, name: 'POOL COGNICAO 2ML', quantity: 16, unit: 'un', lot: 'ATUAL', expiry_date: '09/2027' },
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].quantidade).toBe(16)
    expect(linhas[0].registros).toBe(1)
    expect(linhas[0].lot).toBe('ATUAL')
    expect(linhas[0].expiry_date).toBe('09/2027')
    expect(linhas[0].unit).toBe('un')
  })

  it('ativo com todos os lotes zerados vira uma linha de saldo zero', () => {
    const linhas = agruparParaReposicao([
      item(1, 'L-Carnitina', 0),
      item(2, 'L-Carnitina', 0),
      item(3, 'L-Carnitina', 0),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('L-carnitina')
    expect(linhas[0].quantidade).toBe(0)
    expect(linhas[0].registros).toBe(0)
    expect(linhas[0].unit).toBe('un')
  })

  it('marca quais linhas sao de ativo controlado', () => {
    const linhas = agruparParaReposicao([
      item(1, 'Curcumina', 0),
      item(2, 'Selênio', 0),
    ])
    expect(linhas.find(l => l.nome === 'Curcumina')?.controlado).toBe(true)
    expect(linhas.find(l => l.nome === 'Selênio')?.controlado).toBe(false)
  })
```

Run: `npx jest __tests__/lib/stock-actives.test.ts`
Expected: FAIL — `controlado` não existe, e os lotes zerados ainda contam como cadastro.

- [ ] **Step 3: Reescrever `agruparParaReposicao`**

Em `src/lib/stock-actives.ts`, na interface `LinhaReposicao`, trocar o campo
`unit` e o bloco de `registros` por:

```typescript
  unit: string
  limite: number
  // Cadastros que efetivamente têm saldo. Um lote zerado entra na soma (não
  // muda nada) mas não conta aqui — senão o relatório diz "3 cadastros somados"
  // para um ativo que tem um lote só na prateleira e dois cadastros vazios.
  registros: number
  // Zerado de ativo controlado entra na lista de compra; zerado de qualquer
  // outro item não, senão o relatório enche de cadastro de teste antigo.
  controlado: boolean
```

(Mantenha o comentário que já existe sobre `lot`/`expiry_date` logo abaixo, e
o que explica que `unit` some quando os lotes discordam.)

Substituir o corpo de `agruparParaReposicao` inteiro por:

```typescript
export function agruparParaReposicao(items: ItemParaAgrupar[]): LinhaReposicao[] {
  const porChave = new Map<string, LinhaReposicao>()

  for (const item of items) {
    const ativo = acharAtivo(item.name)
    const chave = ativo ? `ativo:${ativo.nome}` : `item:${item.id}`

    let linha = porChave.get(chave)
    if (!linha) {
      linha = {
        chave,
        nome: ativo ? ativo.nome : item.name.trim(),
        quantidade: 0,
        // Semente: vale só enquanto nenhum lote com saldo aparecer, o que é o
        // caso de um ativo inteiro zerado.
        unit: item.unit,
        limite: ativo ? ativo.limite : LIMITE_PADRAO,
        registros: 0,
        controlado: ativo !== null,
        lot: null,
        expiry_date: null,
      }
      porChave.set(chave, linha)
    }

    linha.quantidade += item.quantity

    // Lote vazio não é lote que você tem: não conta como cadastro e não apaga
    // o lote nem a validade de quem ainda tem saldo.
    if (item.quantity === 0) continue

    if (linha.registros === 0) {
      linha.unit = item.unit
      linha.lot = item.lot
      linha.expiry_date = item.expiry_date
    } else {
      linha.lot = null
      linha.expiry_date = null
      // Lotes com unidades diferentes: nenhuma delas descreve a soma, então
      // não exibe nenhuma. Sem caixa porque "un" e "UN" são a mesma coisa.
      if (linha.unit.toLowerCase() !== item.unit.toLowerCase()) linha.unit = ''
    }
    linha.registros += 1
  }

  return [...porChave.values()]
}
```

Run: `npx jest __tests__/lib/stock-actives.test.ts`
Expected: PASS, todos.

- [ ] **Step 4: Commit da lógica**

```bash
git add src/lib/stock.ts src/app/api/estoque/items/route.ts src/lib/stock-actives.ts __tests__/lib/stock-actives.test.ts && git commit -m "feat(estoque): lote zerado nao conta como cadastro no agrupamento"
```

- [ ] **Step 5: Import e constante no `RelatoriosTab`**

No topo de `src/app/estoque/RelatoriosTab.tsx`, abaixo do `import { useState, useMemo, useEffect, useCallback } from 'react'`:

```typescript
import { agruparParaReposicao, LIMITE_PADRAO, type LinhaReposicao } from '@/lib/stock-actives'
```

Substituir o bloco da linha 18:

```typescript
// Mesma régua da aba "Estoque Atual": abaixo de 5 unidades entra na lista de
// compra. Zerado e negativo são mais urgentes que "Pedir" e vêm primeiro.
const LOW_STOCK_THRESHOLD = 5
```

por:

```typescript
// A régua deixou de ser única: os ativos de uso contínuo entram na lista abaixo
// de 30, o resto abaixo de 5 (LIMITE_PADRAO). Quem decide é o catálogo em
// src/lib/stock-actives.ts. Zerado e negativo continuam vindo primeiro.
```

`reorderRank` e `reorderLabel` ficam como estão — classificam por quantidade
absoluta e continuam corretos.

- [ ] **Step 6: Buscar a lista que inclui os zerados**

Em `src/app/estoque/RelatoriosTab.tsx`, logo depois do
`useEffect(() => { fetchActivity() }, [fetchActivity])` (linha 99):

```typescript
  // A prop `items` vem da listagem padrão, que esconde saldo zero. Numa lista
  // de compra o zerado é o que mais importa, então buscamos a lista completa.
  // Refaz a busca quando `items` muda — é o sinal de que o EstoqueClient
  // recarregou depois de uma movimentação, e a lista de compra não pode ficar
  // atrasada em relação ao resto da tela. Se a busca falhar ficamos com a prop:
  // lista sem os zerados é melhor que tela vazia.
  const [itemsComZerados, setItemsComZerados] = useState<StockItem[] | null>(null)
  useEffect(() => {
    if (report !== 'repor') return
    let cancelado = false
    fetch('/api/estoque/items?zerados=1')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((lista: StockItem[]) => { if (!cancelado) setItemsComZerados(lista) })
      .catch(() => {})
    return () => { cancelado = true }
  }, [report, items])
```

- [ ] **Step 7: Agrupar antes de filtrar**

Substituir o bloco `toReorder` (linha 109):

```typescript
  // ── Repor estoque ──
  // Baseado no saldo ATUAL do item, não no período: é uma lista de compra.
  const toReorder = useMemo(() => {
    return items
      .filter(i => i.quantity < LOW_STOCK_THRESHOLD)
      .sort((a, b) =>
        reorderRank(a.quantity) - reorderRank(b.quantity) ||
        a.quantity - b.quantity ||
        a.name.localeCompare(b.name)
      )
  }, [items])
```

por:

```typescript
  // ── Repor estoque ──
  // Baseado no saldo ATUAL do item, não no período: é uma lista de compra.
  // Agrupa os lotes por ativo ANTES de filtrar — olhar lote a lote fazia o
  // relatório pedir HMB duas vezes com 21 unidades na prateleira.
  // O zerado só entra se for ativo controlado: os demais cadastros zerados são
  // cadastro velho e de teste, e só sujariam a lista.
  const toReorder = useMemo<LinhaReposicao[]>(() => {
    return agruparParaReposicao(itemsComZerados ?? items)
      .filter(l => l.quantidade < l.limite && (l.quantidade !== 0 || l.controlado))
      .sort((a, b) =>
        reorderRank(a.quantidade) - reorderRank(b.quantidade) ||
        a.quantidade - b.quantidade ||
        a.nome.localeCompare(b.nome)
      )
  }, [items, itemsComZerados])
```

- [ ] **Step 8: Ajustar o texto copiável**

Substituir o bloco `if (report === 'repor')` (por volta da linha 186):

```typescript
    if (report === 'repor') {
      // Lista de compra: saldo atual, sem período
      const today = new Date().toLocaleDateString('pt-BR')
      if (toReorder.length === 0) return `Repor Estoque — ${today}\n\nNenhum ativo abaixo de ${LOW_STOCK_THRESHOLD} unidades. Estoque em dia. ✅`
      const lines: string[] = [`Repor Estoque — ${today}`, '']
      toReorder.forEach(i => {
        const meta = [i.lot ? `Lote: ${i.lot}` : null, i.expiry_date ? `Val: ${i.expiry_date}` : null].filter(Boolean).join(' | ')
        lines.push(`• ${i.name} — ${i.quantity} ${i.unit} ${reorderLabel(i.quantity)}${meta ? ` (${meta})` : ''}`)
      })
      lines.push('', `Total: ${toReorder.length} ativo(s) para repor.`)
      return lines.join('\n')
    }
```

por:

```typescript
    if (report === 'repor') {
      // Lista de compra: saldo atual, sem período
      const today = new Date().toLocaleDateString('pt-BR')
      if (toReorder.length === 0) return `Repor Estoque — ${today}\n\nEstoque em dia. ✅`
      const lines: string[] = [`Repor Estoque — ${today}`, '']
      toReorder.forEach(l => {
        const meta = [
          l.lot ? `Lote: ${l.lot}` : null,
          l.expiry_date ? `Val: ${l.expiry_date}` : null,
          l.registros > 1 ? `${l.registros} cadastros somados` : null,
        ].filter(Boolean).join(' | ')
        // Com duas réguas em uso, o número solto não se explica — daí o "/30".
        // A unidade some quando os lotes do ativo discordam dela.
        const saldo = `${l.quantidade}/${l.limite}${l.unit ? ` ${l.unit}` : ''}`
        lines.push(`• ${l.nome} — ${saldo} ${reorderLabel(l.quantidade)}${meta ? ` (${meta})` : ''}`)
      })
      lines.push('', `Total: ${toReorder.length} ativo(s) para repor.`)
      return lines.join('\n')
    }
```

- [ ] **Step 9: Ajustar o render**

Substituir o bloco `{report === 'repor' && (...)}` (por volta da linha 300):

```typescript
      {report === 'repor' && (
        toReorder.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-2xl mb-1">✅</p>
            <p className="text-sm font-semibold text-green-700">Estoque em dia</p>
            <p className="text-xs text-green-600 mt-0.5">Nenhum ativo abaixo de {LOW_STOCK_THRESHOLD} unidades.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{toReorder.length}</p>
              <p className="text-xs text-orange-600 font-medium mt-0.5">ativo(s) para repor</p>
              <p className="text-xs text-orange-500">abaixo de {LOW_STOCK_THRESHOLD} unidades</p>
            </div>

            {toReorder.map(i => {
              const critical = i.quantity <= 0
              return (
                <div key={i.id}
                  className={`rounded-xl border p-4 shadow-sm flex items-start gap-4 ${critical ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">{i.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {i.lot && <p className="text-xs text-gray-500">Lote: <span className="font-medium">{i.lot}</span></p>}
                      {i.expiry_date && <p className="text-xs text-gray-500">Val: <span className="font-medium">{i.expiry_date}</span></p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-bold ${critical ? 'text-red-500' : 'text-orange-500'}`}>{i.quantity}</p>
                    <p className="text-xs text-gray-400">{i.unit}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${critical ? 'text-red-600' : 'text-orange-500'}`}>
                      {reorderLabel(i.quantity)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
```

por:

```typescript
      {report === 'repor' && (
        toReorder.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-2xl mb-1">✅</p>
            <p className="text-sm font-semibold text-green-700">Estoque em dia</p>
            <p className="text-xs text-green-600 mt-0.5">Nenhum ativo abaixo do limite de reposição.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{toReorder.length}</p>
              <p className="text-xs text-orange-600 font-medium mt-0.5">ativo(s) para repor</p>
              <p className="text-xs text-orange-500">
                controlados abaixo de 30 · demais abaixo de {LIMITE_PADRAO}
              </p>
            </div>

            {toReorder.map(l => {
              const critical = l.quantidade <= 0
              return (
                <div key={l.chave}
                  className={`rounded-xl border p-4 shadow-sm flex items-start gap-4 ${critical ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">{l.nome}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {/* Lote e validade só existem quando um cadastro só tem
                          saldo — ver agruparParaReposicao. */}
                      {l.lot && <p className="text-xs text-gray-500">Lote: <span className="font-medium">{l.lot}</span></p>}
                      {l.expiry_date && <p className="text-xs text-gray-500">Val: <span className="font-medium">{l.expiry_date}</span></p>}
                      {l.registros > 1 && (
                        <p className="text-xs text-gray-500">{l.registros} cadastros somados</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-bold ${critical ? 'text-red-500' : 'text-orange-500'}`}>{l.quantidade}</p>
                    <p className="text-xs text-gray-400">de {l.limite}{l.unit ? ` ${l.unit}` : ''}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${critical ? 'text-red-600' : 'text-orange-500'}`}>
                      {reorderLabel(l.quantidade)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
```

- [ ] **Step 10: Verificar**

Run: `npx jest && npx tsc --noEmit && npm run build`
Expected: `stock-actives` verde, nenhum erro novo de tipo, build passa.

`grep -n LOW_STOCK_THRESHOLD src/app/estoque/RelatoriosTab.tsx` deve não retornar nada.

- [ ] **Step 11: Commit**

```bash
git add src/app/estoque/RelatoriosTab.tsx && git commit -m "feat(estoque): relatorio de reposicao agrupa por ativo e usa limite por ativo"
```

---

## Verificação final

- [ ] `npx jest` — as 4 suítes vermelhas continuam sendo só as pré-existentes
      (`task-definitions`, `task-completions`, `patients`, `PatientCard`)
- [ ] `npx tsc --noEmit` — nenhum erro novo além dos de `PatientCard.test.tsx`
- [ ] `npm run build` — passa
- [ ] `grep -n LOW_STOCK_THRESHOLD src/app/estoque/RelatoriosTab.tsx` — nenhum resultado
- [ ] Com o servidor de pé, em Estoque › Relatórios › Repor Estoque: **HMB aparece
      uma vez com 21**, não duas vezes com 0
- [ ] **O Lote e a Validade continuam aparecendo** nos ativos que têm um cadastro
      com saldo e outros zerados — Pool Cognição, HMB, Metilcobalamina, Coenzima
      Q10, Complexo B sem B1, Pool de Minerais, L-baiba e Pill Food. Se algum
      deles mostrar "N cadastros somados" no lugar do lote, o Step 3 não pegou.
- [ ] A aba **Estoque Atual continua idêntica** — os lotes separados, cada um com
      seu número, e nenhum item zerado apareceu lá
- [ ] Os 19 ativos controlados na lista, com estes saldos (conferidos contra o
      banco em 18/08/2026 — os números mudam conforme a clínica movimenta):
      L-carnitina (0), Magnésio 400 mg (0), Pool de Aminoácidos (2), Sulfato de
      Magnésio (6), Pill Food (7), Resveratrol (7), Pool Coenzimático (9),
      Coenzima Q10 (10), Vitamina C 440 mg (13), Vitamina D 600 ADEK (13),
      L-baiba (13), Pool de Minerais (14), Vitamina C 20% (15), Pool Cognição (16),
      HMB (21), Curcumina (21), Complexo B sem B1 (25), Metilcobalamina (25),
      Complexo B com B1 (26)
- [ ] **Fora da lista, por estarem acima de 30:** NAC (43), Vitamina D 600 UI (35),
      Vitamina D 600 UI + K2 (34)
- [ ] Nenhum item zerado **fora** dos 22 controlados aparece — em especial os
      cadastros de teste (`implante teste`, `TESTE`, `TIRZEPARTIDA - TESTE`)
- [ ] Registrar uma saída em outra aba e voltar ao relatório: o número do ativo
      mexido acompanhou (a busca refaz quando `items` muda)
