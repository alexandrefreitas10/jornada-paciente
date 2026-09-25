# Preços — juntar repetição e nome variante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No histórico de cada par produto+laboratório, lançamentos repetidos da mesma nota viram uma linha com a quantidade somada; e o mesmo ativo escrito de formas diferentes na nota cai no mesmo grupo, sem juntar dose nem volume diferentes.

**Architecture:** Duas funções puras novas em `src/lib/precos.ts` (uma chave de produto mais esperta e uma junção de lançamentos repetidos), consumidas pela leitura do banco e pela aba. Nada é gravado nem apagado: o agrupamento passa a ser calculado na leitura, então as 106 compras já lançadas se reorganizam sozinhas.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Postgres (postgres.js), Jest + ts-jest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-25-precos-agrupamento-design.md](../specs/2026-09-25-precos-agrupamento-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/precos.ts` | `chaveProduto` mais esperta, `chaveUnidade` exportada, `juntarRepetidos`, `resumirGrupo` sobre o histórico já juntado. Puro. |
| `src/lib/precos-db.ts` | `listarPrecos` agrupa pela chave calculada na leitura, não pela gravada. |
| `src/app/estoque/PrecosTab.tsx` | Histórico e contador usam o histórico juntado; fonte misturada vira "vários lançamentos". |
| `__tests__/lib/precos.test.ts` | Casos reais de nome e de junção. |
| `__tests__/components/PrecosTab.test.tsx` | Linha somada, contador, "vários lançamentos". |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame rotas e não grave no banco. Só leia onde o plano pedir.
- **`npm run build` roda as migrações idempotentes nesse banco.** Este trabalho não tem migração nenhuma; **não rode o build** — quem roda sou eu no fim.
- **Scripts `.mts` de conferência (somente leitura):** ficam na **raiz do repositório** (fora dela o `import postgres` não resolve), rodam com `node --env-file=.env.local x.mts`, importam `postgres` direto e módulos puros com extensão `.ts`; **não** conseguem importar `src/lib/db.ts` nem `src/lib/stock.ts`. Apague ao terminar e nunca imprima segredos.
- **Falhas que já existiam:** `npx jest` tem 4 suítes vermelhas antes deste trabalho (`task-definitions`, `task-completions`, `patients`, `PatientCard`). `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore, só não aumente a lista.
- **ESLint:** não está configurado. Não rode.
- **`normalizarNome`** (`src/lib/stock-actives.ts`) já faz: minúscula, sem acento, `[^a-z0-9]+` vira espaço, trim. Tudo que este plano acrescenta é **em cima** disso.
- **Nada de migração, nada de escrita.** As colunas `product_key`/`laboratory_key` continuam sendo gravadas como hoje; elas só deixam de mandar no agrupamento da aba.
- **Dose e volume separam produtos** (decisão do dono). Forma farmacêutica e palavra de ligação, não.

---

## Task 1: Regras puras

**Files:**
- Modify: `src/lib/precos.ts`
- Test: `__tests__/lib/precos.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `__tests__/lib/precos.test.ts` (o arquivo já existe e já
testa `chaveProduto` básico, `validarCompra`, `variacao`, `nivelVariacao`,
`resumirGrupo` e `ordenarPorAumento` — **não apague nada**):

```typescript
describe('chaveProduto: mesmo ativo escrito diferente', () => {
  const mesmo = (a: string, b: string) => expect(chaveProduto(a)).toBe(chaveProduto(b))
  const diferente = (a: string, b: string) => expect(chaveProduto(a)).not.toBe(chaveProduto(b))

  it('ignora a forma farmacêutica', () => {
    mesmo('Testosterona 300 MG - Pellet', 'Testosterona 300mg')
    mesmo('NADH 300 MG - Pellet', 'NADH 300MG')
    mesmo('Estradiol 25 mg implante', 'Estradiol 25mg')
  })

  it('ignora o espaço entre número e unidade', () => {
    mesmo('Testosterona 300 mg', 'TESTOSTERONA 300MG')
    mesmo('L-CARNITINA 600MG - 2ML', 'L-Carnitina 600 mg 2 ml')
    mesmo('UNDECANOATO 1G/4ML', 'Undecanoato 1 g 4 ml')
  })

  it('ignora palavra de ligação', () => {
    mesmo('POOL DE AMINOACIDOS 5ML', 'Pool Aminoácidos 5ml')
    mesmo('SULFATO DE ZINCO 20MG - 2ML', 'Sulfato Zinco 20mg 2ml')
  })

  it('dose continua separando', () => {
    diferente('Testosterona 200 mg', 'Testosterona 300 mg')
    diferente('Oxandrolona 100 mg', 'Oxandrolona 200 mg')
  })

  it('volume continua separando', () => {
    diferente('D-RIBOSE 500MG 2ML', 'D-RIBOSE 500MG/3ML')
    diferente('POOL AMINOACIDOS 3,8% - 10ML', 'POOL DE AMINOACIDOS 5ML')
  })

  it('produtos parecidos continuam separados', () => {
    diferente('COMPLEXO B (COM B1) 1ML', 'COMPLEXO B (SEM B1) 1ML')
    diferente('BCAA + HMB - 5ML', 'BCAA + HMB + LIDOCAINA 5ML')
  })

  it('não sabe abreviação — e isso é esperado', () => {
    diferente('HIDROXIMETILBUTIRATO 150MG-2ML', 'HMB 150mg 2ml')
  })
})

describe('juntarRepetidos', () => {
  const c = (data: string, centavos: number, quantidade: number, unidade: string | null = 'un', fonte: Fonte = 'retroativo'): Compra =>
    ({ data, centavos, quantidade, unidade, fonte })

  it('mesma data e mesmo preço viram uma linha com a quantidade somada', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20), c('2026-04-23', 583, 30), c('2026-04-23', 583, 40)])
    expect(r).toHaveLength(1)
    expect(r[0].quantidade).toBe(90)
    expect(r[0].centavos).toBe(583)
    expect(r[0].lancamentos).toBe(3)
    expect(r[0].fonte).toBe('retroativo')
  })

  it('preço diferente na mesma data continua separado', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20), c('2026-04-23', 600, 30)])
    expect(r).toHaveLength(2)
  })

  it('unidade diferente na mesma data continua separada', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20, 'frasco'), c('2026-04-23', 583, 30, 'caixa')])
    expect(r).toHaveLength(2)
  })

  it('plural e singular da unidade são a mesma unidade', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20, 'frascos'), c('2026-04-23', 583, 30, 'frasco')])
    expect(r).toHaveLength(1)
    expect(r[0].quantidade).toBe(50)
  })

  it('fontes diferentes viram fonte nula', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20, 'un', 'nf'), c('2026-04-23', 583, 30, 'un', 'manual')])
    expect(r).toHaveLength(1)
    expect(r[0].fonte).toBeNull()
  })

  it('datas diferentes nunca se juntam, e vêm da mais nova para a mais velha', () => {
    const r = juntarRepetidos([c('2026-04-23', 583, 20), c('2026-08-10', 583, 5), c('2026-04-23', 583, 30)])
    expect(r.map(x => x.data)).toEqual(['2026-08-10', '2026-04-23'])
    expect(r[1].quantidade).toBe(50)
  })

  it('não altera a lista recebida', () => {
    const lista = [c('2026-04-23', 583, 20), c('2026-04-23', 583, 30)]
    juntarRepetidos(lista)
    expect(lista).toHaveLength(2)
  })

  it('lista vazia devolve lista vazia', () => {
    expect(juntarRepetidos([])).toEqual([])
  })
})

describe('resumirGrupo sobre o histórico juntado', () => {
  const g = (historico: Compra[]): GrupoPreco =>
    ({ produto: 'N-Acetil Cisteína 300mg 2ml', laboratorio: 'Health Tech', chave: 'x', historico })
  const c = (data: string, centavos: number, quantidade: number): Compra =>
    ({ data, centavos, quantidade, unidade: 'un', fonte: 'retroativo' })

  it('nota inteira repetida é PRIMEIRA COMPRA, não 0%', () => {
    const r = resumirGrupo(g([c('2026-04-23', 583, 20), c('2026-04-23', 583, 30), c('2026-04-23', 583, 40)]))
    expect(r.anterior).toBeNull()
    expect(r.variacao).toBeNull()
    expect(r.nivel).toBe('primeira')
    expect(r.ultimo.quantidade).toBe(90)
  })

  it('com uma nota mais antiga, compara com ela', () => {
    const r = resumirGrupo(g([
      c('2026-08-10', 700, 10), c('2026-08-10', 700, 10),
      c('2026-04-23', 583, 20), c('2026-04-23', 583, 30),
    ]))
    expect(r.ultimo.centavos).toBe(700)
    expect(r.ultimo.quantidade).toBe(20)
    expect(r.anterior?.centavos).toBe(583)
    expect(r.anterior?.quantidade).toBe(50)
    expect(r.variacao).toBeCloseTo(20.06, 1)
    expect(r.nivel).toBe('alta')
  })
})
```

Acrescentar aos imports do topo do arquivo de teste: `juntarRepetidos` e o tipo
`Fonte`, mantendo os que já estão lá.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/lib/precos.test.ts`
Expected: FAIL — `juntarRepetidos is not a function` e os casos de `chaveProduto`.

- [ ] **Step 3: Implementar em `src/lib/precos.ts`**

**3a.** Trocar `chaveProduto` (hoje é só `return normalizarNome(nome ?? '')`) por:

```typescript
/**
 * Forma farmacêutica não distingue o ativo: o mesmo produto vem "Pellet" numa
 * nota e sem nada na outra. Dose e volume, sim — decisão do dono.
 */
export const PALAVRAS_FORMA = [
  'pellet', 'pellets', 'implante', 'implantes', 'frasco', 'frascos',
  'ampola', 'ampolas', 'comprimido', 'comprimidos', 'capsula', 'capsulas',
  'seringa', 'seringas', 'sache', 'saches', 'pote', 'potes',
]

/** "Pool de Aminoácidos" e "Pool Aminoácidos" são o mesmo produto. */
export const PALAVRAS_LIGACAO = ['de', 'da', 'do', 'das', 'dos']

const PALAVRAS_IGNORADAS = new Set([...PALAVRAS_FORMA, ...PALAVRAS_LIGACAO])

// "300 mg" e "300mg" são a mesma dose escrita de dois jeitos. Só cola quando a
// palavra seguinte ao número é uma unidade conhecida, para não grudar
// "b 12" em "b12" nem número de lote em nome.
const NUMERO_E_UNIDADE = /(\d)\s+(mg|mcg|g|kg|ml|l|ui|ug|mm|cm)\b/g

/** Produto e laboratório são agrupados por nome normalizado, não por id. */
export function chaveProduto(nome: string): string {
  return normalizarNome(nome ?? '')
    .replace(NUMERO_E_UNIDADE, '$1$2')
    .split(' ')
    .filter(p => p && !PALAVRAS_IGNORADAS.has(p))
    .join(' ')
}
```

`chaveLaboratorio` **não muda**: continua `normalizarNome(nome ?? '')`, que já
junta `Bio Meds Pharmaceutica Ltda` com `Bio Meds Pharmaceutica Ltda.`

**3b.** Tornar `chaveUnidade` exportada — trocar a linha
`function chaveUnidade(unidade: string | null): string {` por
`export function chaveUnidade(unidade: string | null): string {`,
mantendo o comentário que já está em cima dela.

**3c.** Acrescentar o tipo e a função de junção, logo **antes** de `resumirGrupo`:

```typescript
/** Uma linha do histórico depois de juntar os lançamentos repetidos da nota. */
export interface CompraAgrupada {
  centavos: number
  quantidade: number // somada
  unidade: string | null
  data: string // AAAA-MM-DD
  fonte: Fonte | null // null = os lançamentos juntados vieram de fontes diferentes
  lancamentos: number // quantas linhas do banco entraram nesta
}

/**
 * A nota fiscal quebra o mesmo ativo em várias linhas (20 + 30 + 40 frascos),
 * todas com o mesmo preço unitário. Para o histórico isso é uma compra só —
 * e, pior, deixava a variação comparar a nota com ela mesma e marcar 0%.
 * Preço diferente ou unidade diferente na mesma data NÃO se juntam: aí é
 * informação de verdade.
 */
export function juntarRepetidos(historico: Compra[]): CompraAgrupada[] {
  const juntadas = new Map<string, CompraAgrupada>()
  // Mais recente primeiro; Map preserva a ordem de inserção, então a saída
  // já sai ordenada sem precisar de um segundo sort.
  for (const c of [...historico].sort((a, b) => b.data.localeCompare(a.data))) {
    const chave = `${c.data}|${c.centavos}|${chaveUnidade(c.unidade)}`
    const atual = juntadas.get(chave)
    if (!atual) {
      juntadas.set(chave, {
        centavos: c.centavos, quantidade: c.quantidade, unidade: c.unidade,
        data: c.data, fonte: c.fonte, lancamentos: 1,
      })
      continue
    }
    atual.quantidade += c.quantidade
    atual.lancamentos += 1
    if (atual.fonte !== c.fonte) atual.fonte = null
  }
  return [...juntadas.values()]
}
```

**3d.** Em `resumirGrupo`, trocar a linha do sort por `juntarRepetidos` e ajustar
o tipo do resumo. O corpo passa a ser:

```typescript
export function resumirGrupo(grupo: GrupoPreco): ResumoPreco {
  // O histórico é juntado antes de comparar: a "compra anterior" tem que ser a
  // nota anterior, não outra linha da mesma nota.
  const historico = juntarRepetidos(grupo.historico)
  const ultimo = historico[0]
  if (!ultimo) throw new Error('resumirGrupo: grupo sem histórico')
  const anterior = historico[1] ?? null
  const unidadeMudou = !!anterior && chaveUnidade(anterior.unidade) !== chaveUnidade(ultimo.unidade)
  const pct = unidadeMudou ? null : variacao(anterior?.centavos ?? null, ultimo.centavos)
  return { ultimo, anterior, variacao: pct, nivel: nivelVariacao(pct), unidadeMudou }
}
```

e na interface `ResumoPreco`, trocar os dois campos:

```typescript
export interface ResumoPreco {
  ultimo: CompraAgrupada
  anterior: CompraAgrupada | null
  variacao: number | null
  nivel: NivelVariacao
  unidadeMudou: boolean
}
```

(O comentário antigo sobre "duas compras na MESMA data mantêm a ordem que o
chamador passou" sai junto com a linha do sort: agora duas compras na mesma
data ou se juntam, ou são preço/unidade diferente e a ordem entre elas não
muda o resultado.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest __tests__/lib/precos.test.ts` → PASS, **inclusive os testes que já existiam**.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

Se algum teste antigo de `resumirGrupo` quebrar, **pare e reporte** em vez de
editar o teste: significa que a junção mudou um comportamento que o dono já
aprovou.

- [ ] **Step 5: Commit**

```bash
git add src/lib/precos.ts __tests__/lib/precos.test.ts && git commit -m "feat(precos): junta lancamento repetido e nome variante do mesmo ativo"
```

---

## Task 2: Leitura, aba e conferência

**Files:**
- Modify: `src/lib/precos-db.ts`
- Modify: `src/app/estoque/PrecosTab.tsx`
- Test: `__tests__/components/PrecosTab.test.tsx`

- [ ] **Step 1: A leitura agrupa pela chave calculada**

Em `src/lib/precos-db.ts`, dentro de `listarPrecos()`, trocar

```typescript
    const chave = `${l.product_key}|${l.laboratory_key}`
```

por

```typescript
    // A chave é calculada aqui, e não a gravada no INSERT: assim as compras já
    // lançadas se reagrupam sozinhas quando a regra de nome melhora, sem
    // migração. As colunas continuam gravadas e indexadas.
    const chave = `${chaveProduto(l.product_name)}|${chaveLaboratorio(l.laboratory)}`
```

`chaveProduto` e `chaveLaboratorio` já estão importados no topo do arquivo.
`product_key` e `laboratory_key` continuam no `SELECT` (a interface
`LinhaCompra` não muda); se o TypeScript reclamar de variável não usada,
deixe como está — o projeto não roda ESLint.

- [ ] **Step 2: Testes da aba que falham**

Acrescentar a `__tests__/components/PrecosTab.test.tsx`, dentro do `describe`
que já existe (não apague nada):

```typescript
  it('junta os lançamentos repetidos da mesma nota numa linha só', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => [{
        produto: 'N-ACETIL CISTEINA 300MG - 2ML', laboratorio: 'Health Tech', chave: 'nac|ht',
        historico: [
          { centavos: 583, quantidade: 20, unidade: 'un', data: '2026-04-23', fonte: 'retroativo' },
          { centavos: 583, quantidade: 30, unidade: 'un', data: '2026-04-23', fonte: 'retroativo' },
          { centavos: 583, quantidade: 40, unidade: 'un', data: '2026-04-23', fonte: 'retroativo' },
        ],
      }],
    }))
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(1))
    // O contador conta linhas já juntadas.
    const abrir = within(linhas()[0]).getByRole('button', { name: /histórico \(1\)/i })
    expect(linhas()[0]).toHaveTextContent('primeira compra')
    expect(linhas()[0]).not.toHaveTextContent('0,0%')
    await userEvent.click(abrir)
    expect(within(linhas()[0]).getByText('90 un')).toBeInTheDocument()
    expect(within(linhas()[0]).queryByText('20 un')).not.toBeInTheDocument()
  })

  it('lançamentos juntados de fontes diferentes dizem "vários lançamentos"', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => [{
        produto: 'TRIMIX 2ML', laboratorio: 'Stin Pharma', chave: 'trimix|stin',
        historico: [
          { centavos: 6900, quantidade: 5, unidade: 'frasco', data: '2026-04-14', fonte: 'retroativo' },
          { centavos: 6900, quantidade: 5, unidade: 'frasco', data: '2026-04-14', fonte: 'nf' },
        ],
      }],
    }))
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(1))
    await userEvent.click(within(linhas()[0]).getByRole('button', { name: /histórico/i }))
    expect(within(linhas()[0]).getByText('vários lançamentos')).toBeInTheDocument()
  })
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx jest __tests__/components/PrecosTab.test.tsx` → FAIL nos dois novos.

- [ ] **Step 4: Implementar na aba**

Em `src/app/estoque/PrecosTab.tsx`:

**4a.** No import de `@/lib/precos`, acrescentar `juntarRepetidos` à lista que
já está lá.

**4b.** Trocar o mapa de rótulos de fonte por um que aceite fonte nula:

```typescript
const FONTE: Record<Compra['fonte'], string> = {
  nf: 'nota fiscal',
  manual: 'lançamento manual',
  retroativo: 'nota antiga',
}
// Quando lançamentos de fontes diferentes caem na mesma linha, não há uma
// fonte para mostrar.
const rotuloFonte = (fonte: Compra['fonte'] | null) => (fonte ? FONTE[fonte] : 'vários lançamentos')
```

**4c.** Dentro do `.map(g => { ... })` que desenha cada card, logo depois de
`const r = resumirGrupo(g)`, acrescentar:

```typescript
            const historico = juntarRepetidos(g.historico)
```

**4d.** No botão, trocar `${g.historico.length}` por `${historico.length}`.

**4e.** Na lista do histórico expandido, trocar

```tsx
                    {[...g.historico].sort((a, b) => b.data.localeCompare(a.data)).map((c, i) => (
```

por

```tsx
                    {historico.map((c, i) => (
```

e, dentro dela, trocar `{FONTE[c.fonte] ?? c.fonte}` por `{rotuloFonte(c.fonte)}`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest __tests__/components/PrecosTab.test.tsx` → PASS (rode 3 vezes).
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 suítes pré-existentes.

- [ ] **Step 6: Conferir contra os dados reais (somente leitura)**

Este passo existe porque a regra nova pode juntar dois produtos que são
diferentes de verdade, e preço lançado não se corrige. São dois arquivos
temporários, porque um script `.mts` rodado com `node --env-file` **não
consegue importar `src/lib/precos.ts`** (ele importa `./money` sem extensão, e
o Node não resolve isso); quem sabe resolver é o Jest. Então: o `.mts` só
despeja os dados, e um teste descartável faz a conta com o código de verdade.

**6a.** Criar na **raiz do repositório** o arquivo `dump-precos.mts`:

```typescript
import { writeFileSync } from 'node:fs'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })
const linhas = await sql`
  SELECT product_name, laboratory, unit_price_cents, quantity, unit, purchased_at, source
  FROM stock_purchases ORDER BY purchased_at DESC`
writeFileSync('precos-dump.json', JSON.stringify(linhas, null, 0))
console.log('linhas:', linhas.length)
await sql.end()
```

Run: `node --env-file=.env.local dump-precos.mts` → deve imprimir `linhas: 106`.

**6b.** Criar `__tests__/lib/conferir-agrupamento.test.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { chaveProduto, chaveLaboratorio, juntarRepetidos, type Compra } from '@/lib/precos'

interface Linha { product_name: string; laboratory: string; unit_price_cents: number; quantity: string; unit: string | null; purchased_at: string; source: Compra['fonte'] }

it('conferência do agrupamento contra os dados reais', () => {
  const linhas: Linha[] = JSON.parse(readFileSync('precos-dump.json', 'utf8'))
  const antes = new Set(linhas.map(l => `${l.product_name}|${l.laboratory}`))
  const grupos = new Map<string, { nomes: Set<string>; historico: Compra[] }>()
  for (const l of linhas) {
    const k = `${chaveProduto(l.product_name)}|${chaveLaboratorio(l.laboratory)}`
    const g = grupos.get(k) ?? { nomes: new Set<string>(), historico: [] }
    g.nomes.add(l.product_name)
    g.historico.push({
      centavos: l.unit_price_cents, quantidade: Number(l.quantity), unidade: l.unit,
      data: new Date(l.purchased_at).toISOString().slice(0, 10), fonte: l.source,
    })
    grupos.set(k, g)
  }
  const juntadas = [...grupos.values()].reduce((s, g) => s + juntarRepetidos(g.historico).length, 0)
  console.log(`linhas: ${linhas.length} | pares nome+lab: ${antes.size} | grupos agora: ${grupos.size} | linhas de historico agora: ${juntadas}`)
  console.log('\n== grupos que juntaram nomes diferentes (CONFERIR UM A UM) ==')
  for (const [k, g] of grupos) if (g.nomes.size > 1) console.log(`${k}\n   ${[...g.nomes].join('\n   ')}`)
})
```

Run: `npx jest __tests__/lib/conferir-agrupamento.test.ts`

O que esperar: `linhas: 106`, `pares nome+lab: 81`, grupos **menor ou igual a
72**, e linhas de histórico bem abaixo de 106. A seção final deve listar, no
máximo, nomes que são de fato o mesmo ativo escrito de outro jeito.

**Se aparecer qualquer grupo juntando dois produtos que não são o mesmo, pare e
reporte** com os nomes exatos — a regra está larga demais e o dono precisa
decidir. Não ajuste a lista de palavras por conta própria.

Depois: `rm dump-precos.mts precos-dump.json __tests__/lib/conferir-agrupamento.test.ts`.
Nenhum dos três entra no commit — confira com `git status` antes de commitar.

- [ ] **Step 7: Commit**

```bash
git add src/lib/precos-db.ts src/app/estoque/PrecosTab.tsx __tests__/components/PrecosTab.test.tsx && git commit -m "feat(precos): aba agrupa pela chave calculada e mostra o historico juntado"
```

---

## Conferência final (quem coordena, não o executor)

- `npm run build` (roda as migrações idempotentes em produção; aqui não há migração nova, só o build).
- Merge em `master` e push — o Render publica sozinho.
- Na aba, conferir que os cards que estavam "0,0%" agora dizem "primeira compra" e que o `UNDECANOATO 1G/4ML` mostra uma linha de 20 un em vez de quatro de 5 un.
