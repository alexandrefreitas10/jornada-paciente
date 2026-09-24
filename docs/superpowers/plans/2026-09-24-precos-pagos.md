# Preços pagos por ativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar o valor pago e o laboratório em toda entrada de estoque, e mostrar numa aba nova o histórico de preço por produto e laboratório, destacando os aumentos.

**Architecture:** Regras puras (dinheiro, chaves, variação) num módulo sem banco. Uma tabela nova guarda cada compra. A entrada de estoque passa a exigir preço e laboratório e grava a compra na mesma transação. Uma aba nova lê o histórico, e um fluxo separado registra preços de notas antigas sem tocar no estoque.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library, Anthropic SDK (leitura da nota).

**Spec:** [docs/superpowers/specs/2026-09-24-precos-pagos-design.md](../specs/2026-09-24-precos-pagos-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/money.ts` | **Movido** de `src/lib/training/money.ts`. Reais ⇄ centavos. |
| `src/lib/precos.ts` | **Novo.** Chaves, variação, níveis, validação, resumo do grupo. Puro. |
| `src/lib/db.ts` | Cria `stock_purchases`. |
| `src/lib/precos-db.ts` | **Novo.** Grava e lê compras. Só servidor. |
| `src/lib/stock.ts` | `createMovement` grava a compra junto da entrada. |
| `src/app/api/estoque/movements/route.ts` | Entrada exige preço e laboratório. |
| `src/app/api/estoque/precos/route.ts` | **Novo.** GET da aba, POST das notas antigas. |
| `src/app/api/estoque/scan-nf/route.ts` | O prompt passa a pedir preço, laboratório e data. |
| `src/app/estoque/PrecosTab.tsx` | **Novo.** A aba. |
| `src/app/estoque/EstoqueClient.tsx` | 5ª aba; campos obrigatórios na NF e no manual. |
| Testes | `__tests__/lib/precos.test.ts` (novo), `__tests__/components/PrecosTab.test.tsx` (novo), `__tests__/lib/training-money.test.ts` (import). |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame rotas e não grave no banco. Só leia quando o plano pedir.
- **`npm run build` roda as migrações idempotentes nesse banco** (a página `/admin/auditoria` é pré-renderizada e chama `initSchema()`). É assim que a tabela nova nasce em produção. Rode o build só onde o plano pede.
- **Scripts `.mts` de conferência (somente leitura):** ficam na raiz, rodam com `node --env-file=.env.local x.mts`, importam `postgres` direto e módulos puros com extensão `.ts`; **não** conseguem importar `src/lib/db.ts` nem `src/lib/stock.ts`. Apague ao terminar e nunca imprima segredos.
- **Falhas que já existiam:** `npx jest` tem 4 suítes vermelhas antes deste trabalho (`task-definitions`, `task-completions`, `patients`, `PatientCard`). `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore, só não aumente a lista.
- **ESLint:** não está configurado. Não rode.
- **Permissão:** `/estoque` já redireciona quem não é admin nem tem `can_estoque` — em produção, isso é só Alexandre, Francielle e Carlos. As rotas de estoque usam `canEstoqueSession()` de `@/lib/authz`.
- **Dinheiro em centavos** (inteiro), como no resto do projeto. `logAudit` vem de `@/lib/audit` e nunca lança erro.
- **Item de estoque = LOTE**, não produto: o histórico de preço agrupa por nome normalizado do produto + laboratório, nunca por `item_id`.
- **`EstoqueClient.tsx` tem ~1400 linhas e nenhum teste.** Faça só as edições descritas, sem reorganizar o arquivo.

---

## Task 1: Regras puras

**Files:**
- Move: `src/lib/training/money.ts` → `src/lib/money.ts`
- Modify: `src/app/admin/treinamento/page.tsx`, `__tests__/lib/training-money.test.ts` (imports)
- Create: `src/lib/precos.ts`
- Test: `__tests__/lib/precos.test.ts`

- [ ] **Step 1: Mover o módulo de dinheiro**

`git mv src/lib/training/money.ts src/lib/money.ts` e trocar o import nos dois
arquivos que o usam:

- `src/app/admin/treinamento/page.tsx`: `from '@/lib/training/money'` → `from '@/lib/money'`
- `__tests__/lib/training-money.test.ts`: idem.

Run: `grep -rn "training/money" src __tests__` → nenhum resultado.
Run: `npx jest __tests__/lib/training-money.test.ts` → PASS.

- [ ] **Step 2: Teste que falha**

Criar `__tests__/lib/precos.test.ts`:

```typescript
// __tests__/lib/precos.test.ts
import {
  chaveProduto, chaveLaboratorio, validarCompra, variacao, nivelVariacao,
  resumirGrupo, ordenarPorAumento,
  ALTA_PCT, ATENCAO_PCT,
  type Compra, type GrupoPreco,
} from '@/lib/precos'

const compra = (data: string, centavos: number, unidade: string | null = 'frasco'): Compra => ({
  centavos, quantidade: 10, unidade, data, fonte: 'nf',
})

describe('chaves de agrupamento', () => {
  it('produto: ignora acento, caixa e pontuação', () => {
    expect(chaveProduto('Vitamina C 440mg')).toBe(chaveProduto('VITAMINA C 440MG'))
    expect(chaveProduto('L-Carnitina')).toBe(chaveProduto('l carnitina'))
    expect(chaveProduto('Coenzima Q10')).not.toBe(chaveProduto('Coenzima Q 100'))
  })

  it('laboratório: mesma regra', () => {
    expect(chaveLaboratorio('BioMeds')).toBe(chaveLaboratorio('biomeds'))
    expect(chaveLaboratorio(' Formédica ')).toBe(chaveLaboratorio('formedica'))
  })

  it('vazio vira vazio', () => {
    expect(chaveProduto('')).toBe('')
    expect(chaveLaboratorio('   ')).toBe('')
  })
})

describe('validarCompra', () => {
  it('aceita o caso normal e devolve os valores limpos', () => {
    expect(validarCompra({ valor: 'R$ 82,00', laboratorio: '  BioMeds ', quantidade: 10 }))
      .toEqual({ ok: true, centavos: 8200, laboratorio: 'BioMeds', quantidade: 10 })
  })

  it('entende o formato brasileiro com milhar', () => {
    expect(validarCompra({ valor: '1.250,50', laboratorio: 'X', quantidade: 1 }))
      .toEqual({ ok: true, centavos: 125050, laboratorio: 'X', quantidade: 1 })
  })

  it('recusa valor zerado, vazio ou sem número', () => {
    for (const valor of ['', '0', '0,00', 'abc', 'R$']) {
      expect(validarCompra({ valor, laboratorio: 'X', quantidade: 1 }).ok).toBe(false)
    }
  })

  it('recusa laboratório vazio e quantidade não positiva', () => {
    expect(validarCompra({ valor: '10,00', laboratorio: '   ', quantidade: 1 }).ok).toBe(false)
    expect(validarCompra({ valor: '10,00', laboratorio: 'X', quantidade: 0 }).ok).toBe(false)
    expect(validarCompra({ valor: '10,00', laboratorio: 'X', quantidade: -2 }).ok).toBe(false)
  })

  it('diz o que está errado', () => {
    const r = validarCompra({ valor: '', laboratorio: '', quantidade: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros).toEqual(['valor', 'laboratorio'])
  })
})

describe('variacao e nivelVariacao', () => {
  it('percentual sobre a compra anterior', () => {
    expect(variacao(10000, 11000)).toBe(10)
    expect(variacao(10000, 9000)).toBe(-10)
    expect(variacao(8200, 8200)).toBe(0)
  })

  it('sem anterior não há variação', () => {
    expect(variacao(null, 10000)).toBeNull()
  })

  it('as fronteiras dos destaques', () => {
    expect(ALTA_PCT).toBe(10)
    expect(ATENCAO_PCT).toBe(5)
    expect(nivelVariacao(null)).toBe('primeira')
    expect(nivelVariacao(10)).toBe('alta')
    expect(nivelVariacao(9.99)).toBe('atencao')
    expect(nivelVariacao(5)).toBe('atencao')
    expect(nivelVariacao(4.99)).toBe('estavel')
    expect(nivelVariacao(-4.99)).toBe('estavel')
    expect(nivelVariacao(-5)).toBe('queda')
  })
})

describe('resumirGrupo', () => {
  const grupo = (historico: Compra[]): GrupoPreco => ({
    produto: 'Vitamina C 440mg', laboratorio: 'BioMeds', chave: 'v|b', historico,
  })

  it('usa a compra mais recente e a anterior', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000), compra('2026-08-10', 10000)]))
    expect(r.ultimo.centavos).toBe(11000)
    expect(r.anterior?.centavos).toBe(10000)
    expect(r.variacao).toBe(10)
    expect(r.nivel).toBe('alta')
    expect(r.unidadeMudou).toBe(false)
  })

  it('primeira compra não tem variação', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 11000)]))
    expect(r.anterior).toBeNull()
    expect(r.variacao).toBeNull()
    expect(r.nivel).toBe('primeira')
  })

  it('unidade diferente entre as duas últimas: sem percentual', () => {
    const r = resumirGrupo(grupo([compra('2026-09-20', 90000, 'caixa'), compra('2026-08-10', 10000, 'frasco')]))
    expect(r.unidadeMudou).toBe(true)
    expect(r.variacao).toBeNull()
    expect(r.nivel).toBe('primeira')
  })

  it('não depende da ordem que veio do banco', () => {
    const r = resumirGrupo(grupo([compra('2026-08-10', 10000), compra('2026-09-20', 11000)]))
    expect(r.ultimo.centavos).toBe(11000)
    expect(r.variacao).toBe(10)
  })
})

describe('ordenarPorAumento', () => {
  const g = (produto: string, historico: Compra[]): GrupoPreco =>
    ({ produto, laboratorio: 'Lab', chave: produto, historico })

  it('maior aumento primeiro; primeira compra por último; empate por nome', () => {
    const grupos = [
      g('Curcumina', [compra('2026-09-20', 10500), compra('2026-08-10', 10000)]), // +5
      g('HMB', [compra('2026-09-20', 13000), compra('2026-08-10', 10000)]),       // +30
      g('Ana', [compra('2026-09-20', 10000)]),                                     // primeira
      g('Baiba', [compra('2026-09-20', 9000), compra('2026-08-10', 10000)]),      // -10
    ]
    expect(ordenarPorAumento(grupos).map(x => x.produto)).toEqual(['HMB', 'Curcumina', 'Baiba', 'Ana'])
  })

  it('não altera a lista recebida', () => {
    const grupos = [g('B', [compra('2026-09-20', 10000)]), g('A', [compra('2026-09-20', 10000)])]
    const antes = grupos.map(x => x.produto)
    ordenarPorAumento(grupos)
    expect(grupos.map(x => x.produto)).toEqual(antes)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx jest __tests__/lib/precos.test.ts`
Expected: FAIL — `Cannot find module '@/lib/precos'`.

- [ ] **Step 4: Implementar**

Criar `src/lib/precos.ts`:

```typescript
// Preços pagos por ativo: regras puras (sem banco, sem React), usadas pela
// tela e pela API para recusarem exatamente a mesma coisa.
import { reaisToCents } from './money'
import { normalizarNome } from './stock-actives'

/** Aumento a partir daqui é 🔴. */
export const ALTA_PCT = 10
/** Aumento a partir daqui é 🟡. */
export const ATENCAO_PCT = 5

export type Fonte = 'nf' | 'manual' | 'retroativo'
export type NivelVariacao = 'alta' | 'atencao' | 'estavel' | 'queda' | 'primeira'

export interface Compra {
  centavos: number
  quantidade: number
  unidade: string | null
  data: string // AAAA-MM-DD
  fonte: Fonte
}

export interface GrupoPreco {
  produto: string
  laboratorio: string
  chave: string
  historico: Compra[]
}

export interface ResumoPreco {
  ultimo: Compra
  anterior: Compra | null
  variacao: number | null
  nivel: NivelVariacao
  unidadeMudou: boolean
}

/** Produto e laboratório são agrupados por nome normalizado, não por id. */
export function chaveProduto(nome: string): string {
  return normalizarNome(nome ?? '')
}

export function chaveLaboratorio(nome: string): string {
  return normalizarNome(nome ?? '')
}

export type ResultadoValidacao =
  | { ok: true; centavos: number; laboratorio: string; quantidade: number }
  | { ok: false; erros: ('valor' | 'laboratorio' | 'quantidade')[] }

/** Valida o que a entrada exige: valor > 0, laboratório e quantidade > 0. */
export function validarCompra(dados: {
  valor: string
  laboratorio: string
  quantidade: number
}): ResultadoValidacao {
  const centavos = reaisToCents(dados.valor ?? '')
  const laboratorio = (dados.laboratorio ?? '').trim()
  const quantidade = Number(dados.quantidade)

  const erros: ('valor' | 'laboratorio' | 'quantidade')[] = []
  if (!(centavos > 0)) erros.push('valor')
  if (!laboratorio) erros.push('laboratorio')
  if (!(quantidade > 0)) erros.push('quantidade')

  return erros.length ? { ok: false, erros } : { ok: true, centavos, laboratorio, quantidade }
}

/** Percentual sobre a compra anterior; `null` quando não há anterior. */
export function variacao(anteriorCentavos: number | null, atualCentavos: number): number | null {
  if (!anteriorCentavos) return null
  return ((atualCentavos - anteriorCentavos) / anteriorCentavos) * 100
}

export function nivelVariacao(pct: number | null): NivelVariacao {
  if (pct === null) return 'primeira'
  if (pct >= ALTA_PCT) return 'alta'
  if (pct >= ATENCAO_PCT) return 'atencao'
  if (pct <= -ATENCAO_PCT) return 'queda'
  return 'estavel'
}

/**
 * Resume um par produto+laboratório. Se a unidade mudou entre as duas últimas
 * compras (caixa → frasco), o percentual não significa nada e some.
 */
export function resumirGrupo(grupo: GrupoPreco): ResumoPreco {
  const historico = [...grupo.historico].sort((a, b) => b.data.localeCompare(a.data))
  const ultimo = historico[0]
  const anterior = historico[1] ?? null
  const unidadeMudou = !!anterior && (anterior.unidade ?? '') !== (ultimo.unidade ?? '')
  const pct = unidadeMudou ? null : variacao(anterior?.centavos ?? null, ultimo.centavos)
  return { ultimo, anterior, variacao: pct, nivel: nivelVariacao(pct), unidadeMudou }
}

/** Maior aumento primeiro; quem não tem comparação vai para o fim. */
export function ordenarPorAumento(grupos: GrupoPreco[]): GrupoPreco[] {
  return [...grupos].sort((a, b) => {
    const va = resumirGrupo(a).variacao
    const vb = resumirGrupo(b).variacao
    if (va === null && vb === null) return a.produto.localeCompare(b.produto, 'pt-BR')
    if (va === null) return 1
    if (vb === null) return -1
    return vb - va || a.produto.localeCompare(b.produto, 'pt-BR')
  })
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest __tests__/lib/precos.test.ts __tests__/lib/training-money.test.ts` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib __tests__/lib src/app/admin/treinamento/page.tsx && git commit -m "feat(precos): regras puras de preco pago e dinheiro compartilhado"
```

---

## Task 2: Tabela e acesso ao banco

**Files:**
- Modify: `src/lib/db.ts`
- Create: `src/lib/precos-db.ts`

- [ ] **Step 1: Migração**

Em `src/lib/db.ts`, no **fim** de `runMigrations()`, antes da `}` que fecha a função:

```typescript

  // Preços pagos: uma linha por compra. O histórico é por produto+laboratório
  // (nome normalizado), porque cada item de estoque é um lote, não um produto.
  await sql.unsafe(`
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
  `).catch(() => {})
```

- [ ] **Step 2: Módulo de servidor**

Criar `src/lib/precos-db.ts`:

```typescript
import sql, { initSchema } from '@/lib/db'
import { chaveLaboratorio, chaveProduto, type Compra, type Fonte, type GrupoPreco } from './precos'

export interface DadosCompra {
  produto: string
  laboratorio: string
  centavos: number
  quantidade: number
  unidade: string | null
  data: string // AAAA-MM-DD
  fonte: Fonte
  itemId?: number | null
  movementId?: number | null
  nfS3Key?: string | null
  createdBy?: string | null
}

// `tx` permite gravar dentro da transação da entrada de estoque: entrada sem
// preço não pode existir.
type Executor = typeof sql

export async function registrarCompra(dados: DadosCompra, tx: Executor = sql): Promise<void> {
  const total = Math.round(dados.centavos * dados.quantidade)
  await tx`
    INSERT INTO stock_purchases (
      product_name, product_key, laboratory, laboratory_key,
      unit_price_cents, quantity, unit, total_cents,
      purchased_at, source, item_id, movement_id, nf_s3_key, created_by
    ) VALUES (
      ${dados.produto}, ${chaveProduto(dados.produto)},
      ${dados.laboratorio}, ${chaveLaboratorio(dados.laboratorio)},
      ${dados.centavos}, ${dados.quantidade}, ${dados.unidade ?? null}, ${total},
      ${dados.data}::date, ${dados.fonte}, ${dados.itemId ?? null},
      ${dados.movementId ?? null}, ${dados.nfS3Key ?? null}, ${dados.createdBy ?? null}
    )
  `
}

export async function registrarComprasRetroativas(lista: DadosCompra[]): Promise<number> {
  if (lista.length === 0) return 0
  await initSchema()
  await sql.begin(async (tx) => {
    for (const dados of lista) await registrarCompra(dados, tx as unknown as Executor)
  })
  return lista.length
}

interface LinhaCompra {
  product_name: string
  product_key: string
  laboratory: string
  laboratory_key: string
  unit_price_cents: number
  quantity: string | number
  unit: string | null
  purchased_at: Date | string
  source: Fonte
}

/** Um grupo por produto+laboratório, com o histórico do mais novo ao mais antigo. */
export async function listarPrecos(): Promise<GrupoPreco[]> {
  await initSchema()
  const linhas = await sql<LinhaCompra[]>`
    SELECT product_name, product_key, laboratory, laboratory_key,
           unit_price_cents, quantity, unit, purchased_at, source
    FROM stock_purchases
    ORDER BY purchased_at DESC, id DESC
  `

  const grupos = new Map<string, GrupoPreco>()
  for (const l of linhas) {
    const chave = `${l.product_key}|${l.laboratory_key}`
    const compra: Compra = {
      centavos: l.unit_price_cents,
      quantidade: Number(l.quantity),
      unidade: l.unit,
      // DATE vem como Date; só a parte do dia interessa.
      data: new Date(l.purchased_at).toISOString().slice(0, 10),
      fonte: l.source,
    }
    const grupo = grupos.get(chave)
    if (grupo) grupo.historico.push(compra)
    // O nome exibido é o da compra mais recente (a consulta já vem ordenada).
    else grupos.set(chave, { produto: l.product_name, laboratorio: l.laboratory, chave, historico: [compra] })
  }
  return [...grupos.values()]
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 suítes pré-existentes.

Se o TypeScript reclamar do tipo do `tx` dentro de `sql.begin`, reporte o erro
exato em vez de redesenhar — a forma usada em `src/lib/patient-archive.ts` é a
referência do projeto.

**Não** rode o build nesta task.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/precos-db.ts && git commit -m "feat(precos): tabela de compras e acesso ao banco"
```

---

## Task 3: Entrada exige preço e laboratório

**Files:**
- Modify: `src/lib/stock.ts`
- Modify: `src/app/api/estoque/movements/route.ts`
- Modify: `src/app/estoque/EstoqueClient.tsx`

- [ ] **Step 1: `createMovement` grava a compra**

Em `src/lib/stock.ts`:

**1a.** Nos imports do topo, acrescentar:

```typescript
import { registrarCompra, type DadosCompra } from './precos-db'
```

**1b.** No objeto de parâmetros de `createMovement`, depois de `idempotency_key?: string | null`:

```typescript
  compra?: Omit<DadosCompra, 'movementId' | 'itemId' | 'createdBy'> | null
```

**1c.** Dentro da transação, **depois** do `INSERT ... RETURNING *` que cria o movimento e **antes** do bloco de reativação do paciente:

```typescript
    // Entrada sem preço não pode existir: grava na mesma transação, e se isto
    // falhar a entrada inteira volta atrás (ao contrário da reativação, que é
    // isolada num savepoint de propósito).
    if (data.type === 'entrada' && data.compra) {
      await registrarCompra(
        {
          ...data.compra,
          itemId: itemId,
          movementId: inserted.id,
          createdBy: data.created_by ?? null,
        },
        tx as unknown as typeof sql,
      )
    }
```

- [ ] **Step 2: A rota exige os dados**

Em `src/app/api/estoque/movements/route.ts`:

**2a.** Imports:

```typescript
import { validarCompra } from '@/lib/precos'
```

**2b.** Trocar a desestruturação do corpo e a validação por:

```typescript
  const { item_id, type, quantity, lot, expiry_date, patient_id, patient_name, observation, nf_s3_key, measurement_id, idempotency_key, unit_price, laboratory, purchased_at, product_name, source, unit } = body
  if (!item_id || !type || !quantity) {
    return NextResponse.json({ error: 'item_id, type e quantity são obrigatórios' }, { status: 400 })
  }

  // Toda ENTRADA registra o que foi pago e de qual laboratório (decisão do
  // dono, sem exceção). Saída não tem preço.
  let compra: DadosEntradaCompra | null = null
  if (type === 'entrada') {
    const produto = String(product_name ?? '').trim()
    const validada = validarCompra({
      valor: String(unit_price ?? ''),
      laboratorio: String(laboratory ?? ''),
      quantidade: Number(quantity),
    })
    if (!produto || !validada.ok) {
      // Sem o nome do produto o histórico ficaria órfão: a chave de
      // agrupamento é o nome normalizado, não o id do item (que é o lote).
      const campos = validada.ok ? [] : validada.erros
      return NextResponse.json(
        { error: 'Informe o produto, o valor pago e o laboratório desta entrada.', campos },
        { status: 400 }
      )
    }
    compra = {
      produto,
      laboratorio: validada.laboratorio,
      centavos: validada.centavos,
      quantidade: validada.quantidade,
      unidade: unit ? String(unit) : null,
      data: typeof purchased_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(purchased_at)
        ? purchased_at
        : new Date().toISOString().slice(0, 10),
      fonte: source === 'manual' ? 'manual' : 'nf',
      nfS3Key: nf_s3_key ?? null,
    }
  }
```

com o tipo importado no topo do arquivo:

```typescript
import type { DadosCompra } from '@/lib/precos-db'
type DadosEntradaCompra = Omit<DadosCompra, 'movementId' | 'itemId' | 'createdBy'>
```

**2c.** Na chamada de `createMovement`, acrescentar `compra,` ao objeto.

Quem lançou fica gravado na própria compra (`created_by`), então a entrada não
precisa de registro extra na auditoria.

- [ ] **Step 3: Tela — conferência da nota**

Em `src/app/estoque/EstoqueClient.tsx`:

**3a.** Trocar a interface da linha da nota (linha ~13):

```typescript
interface NfItem { name: string; quantity: number; unit: string; lot: string | null; expiry_date: string | null }
```

por:

```typescript
interface NfItem {
  name: string; quantity: number; unit: string; lot: string | null; expiry_date: string | null
  unit_price: string; laboratory: string
}
```

**3b.** Onde a resposta do scan vira estado (duas ocorrências de
`setNfItems(data.items)`), normalizar os campos novos:

```typescript
      setNfItems((data.items as Partial<NfItem>[]).map(i => ({
        name: i.name ?? '', quantity: Number(i.quantity ?? 0), unit: i.unit ?? 'un',
        lot: i.lot ?? null, expiry_date: i.expiry_date ?? null,
        unit_price: i.unit_price ?? '', laboratory: i.laboratory ?? '',
      })))
```

**3c.** No bloco de conferência (por volta da linha 1109), acrescentar dois campos
depois do input de validade, antes do botão ✕:

```tsx
                    <input value={ni.unit_price} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))}
                      className="w-28 border border-gray-200 rounded px-2 py-1 text-sm" placeholder="Valor unit. R$ *" />
                    <input value={ni.laboratory} onChange={e => setNfItems(p => p.map((x, i) => i === idx ? { ...x, laboratory: e.target.value } : x))}
                      className="w-32 border border-gray-200 rounded px-2 py-1 text-sm" placeholder="Laboratório *" list="laboratorios" />
```

**3d.** Logo antes do botão "Confirmar Entrada", acrescentar o aviso e travar o botão:

```tsx
              {nfFaltando.length > 0 && (
                <p className="text-sm text-amber-800 mt-3">
                  Falta valor ou laboratório em: {nfFaltando.join(', ')}.
                </p>
              )}
```

e no botão trocar `disabled={nfSaving}` por `disabled={nfSaving || nfFaltando.length > 0}`.

Calcular `nfFaltando` logo antes do `return` do componente:

```typescript
  const nfFaltando = nfItems
    .filter(ni => !validarCompra({ valor: ni.unit_price, laboratorio: ni.laboratory, quantidade: ni.quantity }).ok)
    .map(ni => ni.name || '(sem nome)')
```

**3e.** Em `saveNfItems`, mandar os campos novos no POST do movimento:

```typescript
          body: JSON.stringify({
            item_id: stockItem.id, type: 'entrada', quantity: nfItem.quantity,
            lot: nfItem.lot, expiry_date: nfItem.expiry_date,
            product_name: stockItem.name, unit_price: nfItem.unit_price,
            laboratory: nfItem.laboratory, source: 'nf', nf_s3_key: nfS3Key,
          }),
```

- [ ] **Step 4: Tela — entrada manual**

**4a.** Junto dos outros estados do manual (`meLot`, `meExpiry`…):

```typescript
  const [mePreco, setMePreco] = useState('')
  const [meLab, setMeLab] = useState('')
```

**4b.** Nos **dois** blocos de campos do manual (o da Tirzepatida e o normal),
acrescentar depois do input de observação:

```tsx
                  <input value={mePreco} onChange={e => setMePreco(e.target.value)} placeholder="Valor unit. R$ *" className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <input value={meLab} onChange={e => setMeLab(e.target.value)} placeholder="Laboratório *" className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" list="laboratorios" />
```

**4c.** Em `saveManualEntrada`, mandar os campos e usar o nome do item:

```typescript
    const nomeProduto = meIsNew ? meNewName : (items.find(i => i.id === itemId)?.name ?? '')
    await fetch('/api/estoque/movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId, type: 'entrada', quantity: finalQty,
        lot: meLot || null, expiry_date: meExpiry || null, observation: finalObs,
        product_name: nomeProduto, unit_price: mePreco, laboratory: meLab, source: 'manual',
      }),
    })
```

**4d.** No botão "Salvar Entrada", acrescentar à condição de `disabled`:

```typescript
 || !validarCompra({ valor: mePreco, laboratorio: meLab, quantidade: Number(meQty) || 1 }).ok
```

**4e.** No topo do componente, importar a validação e, no JSX (uma vez, perto do
fim do `return`), a lista de sugestões de laboratório:

```typescript
import { validarCompra } from '@/lib/precos'
```

```tsx
      <datalist id="laboratorios">
        {laboratorios.map(l => <option key={l} value={l} />)}
      </datalist>
```

com

```typescript
  const [laboratorios, setLaboratorios] = useState<string[]>([])
```

preenchido no mesmo `useEffect` que já carrega itens e movimentos:

```typescript
    fetch('/api/estoque/precos')
      .then(r => (r.ok ? r.json() : []))
      .then((grupos: { laboratorio: string }[]) =>
        setLaboratorios([...new Set(grupos.map(g => g.laboratorio))].sort((a, b) => a.localeCompare(b, 'pt-BR'))))
      .catch(() => {})
```

(A rota `/api/estoque/precos` chega na Task 4; até lá o `catch` deixa a lista vazia
e os campos continuam funcionando como texto livre.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.
Run: `npm run build 2>&1 | grep -E "Compiled|Failed|Type error"` → compilou.

Confira lendo o código: saída (`type: 'saida'`) **não** passa por nenhuma
validação nova; o caminho de idempotência continua devolvendo o movimento
existente sem gravar compra em dobro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stock.ts src/app/api/estoque/movements/route.ts src/app/estoque/EstoqueClient.tsx && git commit -m "feat(precos): entrada exige valor pago e laboratorio"
```

---

## Task 4: Aba Preços

**Files:**
- Create: `src/app/api/estoque/precos/route.ts`
- Create: `src/app/estoque/PrecosTab.tsx`
- Modify: `src/app/estoque/EstoqueClient.tsx` (5ª aba)
- Test: `__tests__/components/PrecosTab.test.tsx`

- [ ] **Step 1: Rota**

Criar `src/app/api/estoque/precos/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { canEstoqueSession } from '@/lib/authz'
import { listarPrecos } from '@/lib/precos-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  return NextResponse.json(await listarPrecos())
}
```

- [ ] **Step 2: Teste da aba que falha**

Criar `__tests__/components/PrecosTab.test.tsx`:

```typescript
// __tests__/components/PrecosTab.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrecosTab } from '@/app/estoque/PrecosTab'
import type { GrupoPreco } from '@/lib/precos'

const GRUPOS: GrupoPreco[] = [
  {
    produto: 'HMB', laboratorio: 'BioMeds', chave: 'hmb|biomeds',
    historico: [
      { centavos: 13000, quantidade: 10, unidade: 'frasco', data: '2026-09-20', fonte: 'nf' },
      { centavos: 10000, quantidade: 10, unidade: 'frasco', data: '2026-08-10', fonte: 'nf' },
    ],
  },
  {
    produto: 'Curcumina', laboratorio: 'Formedica', chave: 'curcumina|formedica',
    historico: [
      { centavos: 10600, quantidade: 5, unidade: 'frasco', data: '2026-09-18', fonte: 'manual' },
      { centavos: 10000, quantidade: 5, unidade: 'frasco', data: '2026-07-01', fonte: 'retroativo' },
    ],
  },
  {
    produto: 'Pill Food', laboratorio: 'BioMeds', chave: 'pill food|biomeds',
    historico: [{ centavos: 8200, quantidade: 1, unidade: 'frasco', data: '2026-09-01', fonte: 'retroativo' }],
  },
]

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => GRUPOS }))
  global.fetch = fetchMock as unknown as typeof fetch
})

const linhas = () => screen.getAllByRole('listitem')

describe('PrecosTab', () => {
  it('lista por produto e laboratório, maior aumento primeiro', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(linhas().map(l => within(l).getByRole('heading').textContent)).toEqual([
      'HMB · BioMeds', 'Curcumina · Formedica', 'Pill Food · BioMeds',
    ])
  })

  it('mostra o último valor, a data e a variação', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    const hmb = linhas()[0]
    expect(hmb).toHaveTextContent('R$ 130,00')
    expect(hmb).toHaveTextContent('/ frasco')
    expect(hmb).toHaveTextContent('20/09/2026')
    expect(hmb).toHaveTextContent('+30,0%')
    expect(hmb).toHaveTextContent('🔴')
  })

  it('aumento entre 5% e 10% é atenção; primeira compra não tem percentual', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(linhas()[1]).toHaveTextContent('🟡')
    expect(linhas()[2]).toHaveTextContent('primeira compra')
    expect(linhas()[2]).not.toHaveTextContent('%')
  })

  it('abre o histórico do par', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.click(within(linhas()[0]).getByRole('button', { name: /histórico/i }))
    expect(within(linhas()[0]).getByText(/10\/08\/2026/)).toBeInTheDocument()
    expect(within(linhas()[0]).getByText(/R\$ 100,00/)).toBeInTheDocument()
  })

  it('busca por produto e por laboratório', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    const busca = screen.getByRole('searchbox')
    await userEvent.type(busca, 'formedica')
    expect(linhas()).toHaveLength(1)
    expect(linhas()[0]).toHaveTextContent('Curcumina')
    await userEvent.clear(busca)
    await userEvent.type(busca, 'pill')
    expect(linhas()).toHaveLength(1)
  })

  it('avisa quando não há nada registrado', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [] }))
    render(<PrecosTab />)
    expect(await screen.findByText(/Nenhum preço registrado ainda/)).toBeInTheDocument()
  })

  it('avisa quando a lista não carrega', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    render(<PrecosTab />)
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx jest __tests__/components/PrecosTab.test.tsx` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar a aba**

Criar `src/app/estoque/PrecosTab.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { centsToReais } from '@/lib/money'
import { normalizarNome } from '@/lib/stock-actives'
import { ordenarPorAumento, resumirGrupo, type GrupoPreco, type NivelVariacao } from '@/lib/precos'

const NIVEL: Record<NivelVariacao, { icone: string; classe: string }> = {
  alta: { icone: '🔴', classe: 'text-red-700 bg-red-50 border-red-200' },
  atencao: { icone: '🟡', classe: 'text-yellow-800 bg-yellow-50 border-yellow-200' },
  estavel: { icone: '', classe: 'text-gray-600 bg-gray-50 border-gray-200' },
  queda: { icone: '🟢', classe: 'text-green-700 bg-green-50 border-green-200' },
  primeira: { icone: '', classe: 'text-gray-500 bg-gray-50 border-gray-200' },
}

const reais = (centavos: number) => `R$ ${centsToReais(centavos) || '0,00'}`
const dia = (data: string) => new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`

export function PrecosTab() {
  const [grupos, setGrupos] = useState<GrupoPreco[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await fetch('/api/estoque/precos')
      if (!res.ok) throw new Error(String(res.status))
      setGrupos(await res.json())
    } catch {
      setErro('Não foi possível carregar os preços. Recarregue a página.')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  if (!grupos) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-500">
        {erro ?? 'Carregando...'}
      </div>
    )
  }

  const termo = normalizarNome(busca)
  const visiveis = ordenarPorAumento(grupos).filter(g =>
    !termo || normalizarNome(`${g.produto} ${g.laboratorio}`).includes(termo)
  )

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>
        <input
          type="search"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto ou laboratório"
          aria-label="Buscar produto ou laboratório"
          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {grupos.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">
          Nenhum preço registrado ainda. Eles aparecem aqui conforme as entradas forem lançadas.
        </p>
      ) : visiveis.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">Nada encontrado para &quot;{busca.trim()}&quot;.</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map(g => {
            const r = resumirGrupo(g)
            const nivel = NIVEL[r.nivel]
            const abertoAqui = aberto === g.chave
            return (
              <li key={g.chave} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 break-words">{g.produto} · {g.laboratorio}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {reais(r.ultimo.centavos)}{r.ultimo.unidade ? ` / ${r.ultimo.unidade}` : ''} · {dia(r.ultimo.data)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${nivel.classe}`}>
                    {r.variacao === null
                      ? (r.unidadeMudou ? 'unidade mudou' : 'primeira compra')
                      : `${nivel.icone} ${pct(r.variacao)}`}
                  </span>
                </div>

                {r.unidadeMudou && r.anterior && (
                  <p className="text-xs text-gray-500">
                    unidade mudou: {r.anterior.unidade ?? '—'} → {r.ultimo.unidade ?? '—'}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setAberto(a => (a === g.chave ? null : g.chave))}
                  aria-expanded={abertoAqui}
                  className="text-xs font-medium text-violet-700 hover:text-violet-900"
                >
                  {abertoAqui ? '▲ Fechar histórico' : `▼ Ver histórico (${g.historico.length})`}
                </button>

                {abertoAqui && (
                  <ul className="border-t border-gray-100 pt-2 space-y-1">
                    {[...g.historico].sort((a, b) => b.data.localeCompare(a.data)).map((c, i) => (
                      <li key={i} className="flex flex-wrap gap-x-3 text-xs text-gray-600">
                        <span className="font-medium text-gray-800">{reais(c.centavos)}</span>
                        <span>{c.quantidade}{c.unidade ? ` ${c.unidade}` : ''}</span>
                        <span>{dia(c.data)}</span>
                        <span className="text-gray-400">{c.fonte === 'retroativo' ? 'nota antiga' : c.fonte}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Ligar a aba**

Em `src/app/estoque/EstoqueClient.tsx`:
- import: `import { PrecosTab } from './PrecosTab'`
- `type Tab = 'estoque' | 'entradas' | 'saidas' | 'relatorios' | 'precos'`
- no seletor de abas, acrescentar `precos` com o rótulo `💰 Preços` (siga o formato das outras)
- no corpo: `{tab === 'precos' && <PrecosTab />}`

- [ ] **Step 6: Verificar**

Run: `npx jest __tests__/components/PrecosTab.test.tsx` → PASS (3 vezes).
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/estoque/precos src/app/estoque/PrecosTab.tsx src/app/estoque/EstoqueClient.tsx __tests__/components/PrecosTab.test.tsx && git commit -m "feat(precos): aba de precos pagos"
```

---

## Task 5: Notas antigas (retroativo) e leitura da nota

**Files:**
- Modify: `src/app/api/estoque/scan-nf/route.ts`
- Modify: `src/app/api/estoque/precos/route.ts` (POST)
- Modify: `src/app/estoque/PrecosTab.tsx`

- [ ] **Step 1: A leitura passa a pedir preço, laboratório e data**

Em `src/app/api/estoque/scan-nf/route.ts`, trocar `PROMPT_NF` por:

```typescript
const PROMPT_NF = `Esta é uma nota fiscal ou documento de compra de medicamentos/insumos médicos.
Identifique cada item e retorne APENAS um JSON array com o seguinte formato (sem texto extra, somente o array):
[
  {
    "name": "Nome do medicamento ou insumo",
    "quantity": 10,
    "unit": "caixas",
    "lot": "ABC123",
    "expiry_date": "12/2026",
    "unit_price": "82,00",
    "laboratory": "Nome do laboratório/fabricante ou do fornecedor que emitiu a nota",
    "purchase_date": "2026-09-20"
  }
]
Regras:
- "unit_price" é o valor de UMA unidade (o valor unitário da linha, não o total). Use o formato brasileiro, sem "R$".
- "laboratory" é o mesmo para todos os itens quando a nota tem um único emitente.
- "purchase_date" é a data de emissão da nota, no formato AAAA-MM-DD.
- Se não encontrar algum campo, use null. Não invente valores.
Seja objetivo e liste todos os itens da nota.`
```

- [ ] **Step 2: POST das notas antigas**

Em `src/app/api/estoque/precos/route.ts`, acrescentar:

```typescript
import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { validarCompra } from '@/lib/precos'
import { registrarComprasRetroativas, type DadosCompra } from '@/lib/precos-db'

export async function POST(req: NextRequest) {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  const session = await auth()
  const userName = session?.user?.name ?? 'desconhecido'

  const body = await req.json().catch(() => null)
  const itens = Array.isArray(body?.itens) ? body.itens : null
  if (!itens || itens.length === 0) {
    return NextResponse.json({ error: 'Nenhum item enviado' }, { status: 400 })
  }

  const compras: DadosCompra[] = []
  for (const i of itens) {
    const produto = String(i?.produto ?? '').trim()
    const validada = validarCompra({
      valor: String(i?.valor ?? ''),
      laboratorio: String(i?.laboratorio ?? ''),
      quantidade: Number(i?.quantidade ?? 0),
    })
    const data = String(i?.data ?? '')
    if (!produto || !validada.ok || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: `Item inválido: ${produto || '(sem nome)'}` }, { status: 400 })
    }
    compras.push({
      produto,
      laboratorio: validada.laboratorio,
      centavos: validada.centavos,
      quantidade: validada.quantidade,
      unidade: i?.unidade ? String(i.unidade) : null,
      data,
      fonte: 'retroativo',
      nfS3Key: i?.nfS3Key ? String(i.nfS3Key) : null,
      createdBy: userName,
    })
  }

  const total = await registrarComprasRetroativas(compras)
  await logAudit({
    userName,
    action: 'precos_retroativos_registrados',
    entityType: 'stock_purchase',
    details: `${total} item(ns)`,
  })
  return NextResponse.json({ registrados: total }, { status: 201 })
}
```

- [ ] **Step 3: Fluxo na aba**

Em `src/app/estoque/PrecosTab.tsx`:

**3a.** Acrescentar aos imports `useRef` e `validarCompra`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { ordenarPorAumento, resumirGrupo, validarCompra, type GrupoPreco, type NivelVariacao } from '@/lib/precos'
```

**3b.** Acrescentar o tipo e os estados, logo abaixo de `const [aberto, setAberto] = useState<string | null>(null)`:

```typescript
interface LinhaNota {
  produto: string
  quantidade: string
  unidade: string
  valor: string
  laboratorio: string
}

  const [linhas, setLinhas] = useState<LinhaNota[] | null>(null)
  const [dataNota, setDataNota] = useState('')
  const [s3Key, setS3Key] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)
```

(o `interface LinhaNota` vai no topo do arquivo, fora do componente.)

**3c.** Acrescentar as duas funções, antes do `if (!grupos)`:

```typescript
  const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  async function lerNota(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setLendo(true)
    setErro(null)
    try {
      const form = new FormData()
      form.append('file', arquivo)
      const res = await fetch('/api/estoque/scan-nf', { method: 'POST', body: form })
      if (!res.ok) throw new Error(String(res.status))
      const dados = await res.json()
      if (dados.parseError || !Array.isArray(dados.items) || dados.items.length === 0) {
        setErro(dados.parseError || 'Não foi possível ler os itens da nota.')
        return
      }
      type ItemLido = { name?: string; quantity?: number; unit?: string; unit_price?: string; laboratory?: string; purchase_date?: string }
      const itens = dados.items as ItemLido[]
      setLinhas(itens.map(i => ({
        produto: i.name ?? '',
        quantidade: String(i.quantity ?? 1),
        unidade: i.unit ?? '',
        valor: i.unit_price ?? '',
        laboratorio: i.laboratory ?? '',
      })))
      const lida = itens.find(i => /^\d{4}-\d{2}-\d{2}$/.test(i.purchase_date ?? ''))?.purchase_date
      setDataNota(lida ?? hoje())
      setS3Key(dados.s3Key ?? null)
    } catch {
      setErro('Não foi possível ler a nota. Tente de novo.')
    } finally {
      setLendo(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  async function salvarNota() {
    if (!linhas) return
    setSalvando(true)
    setErro(null)
    try {
      const res = await fetch('/api/estoque/precos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: linhas.map(l => ({
            produto: l.produto,
            valor: l.valor,
            laboratorio: l.laboratorio,
            quantidade: Number(l.quantidade),
            unidade: l.unidade || null,
            data: dataNota,
            nfS3Key: s3Key,
          })),
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setLinhas(null)
      setS3Key(null)
      await carregar()
    } catch {
      setErro('Não foi possível salvar os preços. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }
```

**3d.** Calcular o que falta, logo depois de `const visiveis = ...`:

```typescript
  const notaFaltando = (linhas ?? [])
    .filter(l => !l.produto.trim() || !validarCompra({ valor: l.valor, laboratorio: l.laboratorio, quantidade: Number(l.quantidade) }).ok)
    .map(l => l.produto.trim() || '(sem nome)')
```

**3e.** Acrescentar o bloco acima da busca, dentro do `<div className="space-y-4">`:

```tsx
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => arquivoRef.current?.click()}
            disabled={lendo}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {lendo ? 'Lendo a nota...' : '📄 Registrar preços de nota antiga'}
          </button>
          <p className="text-xs text-gray-500">Isto não dá entrada no estoque — só registra o preço.</p>
        </div>
        <input
          ref={arquivoRef}
          type="file"
          accept="image/*,application/pdf"
          aria-label="Foto ou PDF da nota antiga"
          onChange={lerNota}
          className="hidden"
        />
        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

        {linhas && (
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Data da compra
              <input
                type="date"
                value={dataNota}
                onChange={e => setDataNota(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
            {linhas.map((l, idx) => (
              <div key={idx} className="flex gap-2 flex-wrap items-center bg-gray-50 border border-gray-100 rounded-lg p-2">
                <input value={l.produto} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, produto: e.target.value } : x))}
                  aria-label={`Produto ${idx + 1}`} placeholder="Produto *" className="flex-1 min-w-[140px] border border-gray-200 rounded px-2 py-1 text-sm" />
                <input value={l.quantidade} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))}
                  aria-label={`Quantidade ${idx + 1}`} placeholder="Qtd" className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
                <input value={l.unidade} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, unidade: e.target.value } : x))}
                  aria-label={`Unidade ${idx + 1}`} placeholder="Un" className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
                <input value={l.valor} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                  aria-label={`Valor unitário ${idx + 1}`} placeholder="Valor unit. R$ *" className="w-28 border border-gray-200 rounded px-2 py-1 text-sm" />
                <input value={l.laboratorio} onChange={e => setLinhas(p => p!.map((x, i) => i === idx ? { ...x, laboratorio: e.target.value } : x))}
                  aria-label={`Laboratório ${idx + 1}`} placeholder="Laboratório *" className="w-32 border border-gray-200 rounded px-2 py-1 text-sm" />
                <button type="button" onClick={() => setLinhas(p => p!.filter((_, i) => i !== idx))}
                  aria-label={`Remover ${l.produto || 'item'}`} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
              </div>
            ))}
            {notaFaltando.length > 0 && (
              <p className="text-sm text-amber-800">Falta valor ou laboratório em: {notaFaltando.join(', ')}.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={salvarNota}
                disabled={salvando || linhas.length === 0 || notaFaltando.length > 0}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar preços'}
              </button>
              <button type="button" onClick={() => { setLinhas(null); setS3Key(null) }}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
```

**3f.** Como o `erro` agora também serve para a leitura da nota, trocar a tela de
carregamento para não sumir com a lista já carregada: o `if (!grupos)` continua
igual (só cai nele antes da primeira carga).

- [ ] **Step 3b: Testes do fluxo de nota antiga**

Acrescentar a `__tests__/components/PrecosTab.test.tsx`:

```typescript
  const arquivo = () => new File(['x'], 'nota.jpg', { type: 'image/jpeg' })

  it('lê a nota antiga e trava o salvar enquanto faltar valor ou laboratório', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('scan-nf')
        ? { ok: true, status: 200, json: async () => ({
            items: [
              { name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '', laboratory: 'BioMeds', purchase_date: '2026-05-10' },
            ],
            s3Key: 'stock-entries/nf/1.jpg',
          }) }
        : { ok: true, status: 200, json: async () => GRUPOS })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())

    const salvar = await screen.findByRole('button', { name: 'Salvar preços' })
    expect(salvar).toBeDisabled()
    expect(screen.getByText(/Falta valor ou laboratório em: HMB/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Valor unitário 1'), '100,00')
    expect(salvar).toBeEnabled()
  })

  it('salva os preços da nota antiga e recarrega a lista', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('scan-nf')) {
        return { ok: true, status: 200, json: async () => ({
          items: [{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '100,00', laboratory: 'BioMeds', purchase_date: '2026-05-10' }],
          s3Key: 'stock-entries/nf/1.jpg',
        }) }
      }
      if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ registrados: 1 }) }
      return { ok: true, status: 200, json: async () => GRUPOS }
    })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar preços' }))

    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')
    expect(post[0]).toBe('/api/estoque/precos')
    expect(JSON.parse(String(post[1].body))).toEqual({
      itens: [{
        produto: 'HMB', valor: '100,00', laboratorio: 'BioMeds', quantidade: 10,
        unidade: 'frasco', data: '2026-05-10', nfS3Key: 'stock-entries/nf/1.jpg',
      }],
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar preços' })).not.toBeInTheDocument())
  })
```

- [ ] **Step 4: Verificar**

Run: `npx jest __tests__/components/PrecosTab.test.tsx` → PASS (3 vezes).
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 pré-existentes.
Run: `npm run build 2>&1 | grep -E "Compiled|Failed|Type error"` → compilou; a rota
`/api/estoque/precos` aparece na lista.

Esse build cria a tabela `stock_purchases` em produção.

- [ ] **Step 5: Conferência em produção (somente leitura)**

Criar `conferir-precos.mts` na raiz:

```typescript
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 60 })
const [t] = await sql`SELECT to_regclass('public.stock_purchases') AS tabela`
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'stock_purchases' ORDER BY ordinal_position`
const [n] = await sql`SELECT COUNT(*) AS linhas FROM stock_purchases`
await sql.end()
console.log('tabela:', t.tabela, '\ncolunas:', cols.map(c => c.column_name).join(', '), '\nlinhas:', n.linhas)
```

Run: `node --env-file=.env.local conferir-precos.mts`
Expected: a tabela existe, com as colunas do plano, e **0 linhas**.
Depois: `rm conferir-precos.mts`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/estoque/scan-nf/route.ts src/app/api/estoque/precos/route.ts src/app/estoque/PrecosTab.tsx __tests__/components/PrecosTab.test.tsx && git commit -m "feat(precos): leitura de preco na nota e registro de notas antigas"
```

---

## Verificação final

- [ ] `npx jest`: só as 4 suítes pré-existentes em FAIL
- [ ] `npx tsc --noEmit`: nenhum erro novo
- [ ] `npm run build`: passa
- [ ] a conferência da Task 5 mostrou a tabela criada e vazia
- [ ] `grep -rn "training/money" src __tests__`: nenhum resultado
- [ ] `git status`: nada solto, exceto `.claude/launch.json`, que já estava modificado antes
- [ ] Depois do deploy, o dono confere:
  - lançar uma entrada manual sem valor: o botão fica travado;
  - lançar com valor e laboratório: aparece na aba Preços;
  - enviar uma nota antiga: os preços entram e o estoque **não** muda;
  - a segunda compra do mesmo produto e laboratório mostra a variação.
