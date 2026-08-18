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
| `src/app/estoque/RelatoriosTab.tsx` | Consome o agrupamento; exibe o limite por linha. |

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

## Task 2: Relatório usa o agrupamento

**Files:**
- Modify: `src/app/estoque/RelatoriosTab.tsx`

- [ ] **Step 1: Trocar a constante pelo import**

No topo de `src/app/estoque/RelatoriosTab.tsx`, logo abaixo do `import { useState, ... } from 'react'`:

```typescript
import { agruparParaReposicao, LIMITE_PADRAO, type LinhaReposicao } from '@/lib/stock-actives'
```

Substituir o bloco atual (por volta da linha 18):

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

Mantenha `reorderRank` e `reorderLabel` como estão — classificam por quantidade
absoluta e continuam corretos.

- [ ] **Step 2: Agrupar antes de filtrar**

Substituir o bloco `toReorder` (por volta da linha 109):

```typescript
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
  // Agrupa os lotes por ativo ANTES de filtrar: olhar lote a lote faz o
  // relatório pedir reposição de algo que existe na prateleira.
  const toReorder = useMemo<LinhaReposicao[]>(() => {
    return agruparParaReposicao(items)
      .filter(l => l.quantidade < l.limite)
      .sort((a, b) =>
        reorderRank(a.quantidade) - reorderRank(b.quantidade) ||
        a.quantidade - b.quantidade ||
        a.nome.localeCompare(b.nome)
      )
  }, [items])
```

- [ ] **Step 3: Ajustar o texto copiável**

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
        // Com duas réguas em uso, o número solto não se explica — daí o "/30".
        const meta = [
          l.lot ? `Lote: ${l.lot}` : null,
          l.expiry_date ? `Val: ${l.expiry_date}` : null,
          l.registros > 1 ? `${l.registros} lotes somados` : null,
        ].filter(Boolean).join(' | ')
        lines.push(`• ${l.nome} — ${l.quantidade}/${l.limite} ${l.unit} ${reorderLabel(l.quantidade)}${meta ? ` (${meta})` : ''}`)
      })
      lines.push('', `Total: ${toReorder.length} ativo(s) para repor.`)
      return lines.join('\n')
    }
```

- [ ] **Step 4: Ajustar o render**

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
                      {/* Lote e validade só existem quando a linha é de um
                          registro só — ver agruparParaReposicao. */}
                      {l.lot && <p className="text-xs text-gray-500">Lote: <span className="font-medium">{l.lot}</span></p>}
                      {l.expiry_date && <p className="text-xs text-gray-500">Val: <span className="font-medium">{l.expiry_date}</span></p>}
                      {l.registros > 1 && (
                        <p className="text-xs text-gray-500">{l.registros} lotes somados</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-bold ${critical ? 'text-red-500' : 'text-orange-500'}`}>{l.quantidade}</p>
                    <p className="text-xs text-gray-400">de {l.limite} {l.unit}</p>
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

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros novos; build passa.

Se sobrou alguma referência a `LOW_STOCK_THRESHOLD`, o `tsc` vai acusar. Procure
com `grep -n LOW_STOCK_THRESHOLD src/app/estoque/RelatoriosTab.tsx` e troque pelo
limite da linha (`l.limite`) ou por `LIMITE_PADRAO`, conforme o contexto.

- [ ] **Step 6: Commit**

```bash
git add src/app/estoque/RelatoriosTab.tsx && git commit -m "feat(estoque): relatorio de reposicao agrupa lotes por ativo e usa limite por ativo"
```

---

## Verificação final

- [ ] `npx jest __tests__/lib/stock-actives.test.ts` — todos passando
- [ ] `npx jest` — as 4 suítes que **já estavam quebradas antes deste trabalho** continuam sendo as únicas vermelhas
- [ ] `npx tsc --noEmit` — sem erros novos
- [ ] `npm run build` — passa
- [ ] `grep -n LOW_STOCK_THRESHOLD src/app/estoque/RelatoriosTab.tsx` — **nenhum resultado**
- [ ] Com o servidor de pé, em Estoque › Relatórios › Repor Estoque: **HMB aparece uma vez com 21**, não duas vezes com 0
- [ ] A aba **Estoque Atual continua mostrando os lotes separados**, cada um com seu número — nada ali pode ter mudado
- [ ] 19 ativos na lista: L-carnitina (0), Magnésio 400 mg (0), Pool de Aminoácidos (2), Sulfato de Magnésio (6), Pill Food (7), Resveratrol (7), Pool Coenzimático (9), Coenzima Q10 (10), Vitamina C 440 mg (13), Vitamina D ADEK (13), L-baiba (13), Pool de Minerais (14), Vitamina C 20% (15), Pool Cognição (16), HMB (21), Curcumina (21), Complexo B sem B1 (25), Metilcobalamina (25), Complexo B com B1 (26)
- [ ] **Fora da lista:** NAC (43), Vitamina D 600 UI (35), Vitamina D 600 UI + K2 (34)
