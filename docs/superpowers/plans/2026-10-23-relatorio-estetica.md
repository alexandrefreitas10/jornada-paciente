# Relatórios › Estética — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba Estética no Relatórios, com uma sub-aba por procedimento (vindas dos dados, não de uma lista fixa), mostrando quem tem sessão em aberto e quem já finalizou.

**Architecture:** Espelha o "Em tratamento", a aba irmã: regra pura numa lib testável sem banco, consulta numa lib-db, rota GET com sessão, componente só desenhando.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Postgres via postgres.js, Jest.

**Spec:** `docs/superpowers/specs/2026-10-23-relatorio-estetica-design.md`.

---

## Contexto que todo implementador precisa saber

1. **Não rode `npm run build`:** neste projeto ele roda migração no Postgres de **produção**. Verificação é `npx tsc --noEmit` e `npx jest`.
2. **Esta entrega não cria nem altera tabela.** Só lê `aesthetic_sessions` e `aesthetic_session_completions`.
3. **4 suítes já falham antes desta branch** e não são escopo: `task-definitions`, `task-completions`, `patients`, `PatientCard`. `RelatoriosTab` e `ConciliacaoClient` falham de forma **intermitente sob carga** — rode-as sozinhas para confirmar.
4. **Nome de paciente real nunca entra em teste, fixture ou commit.** Nome de *procedimento* pode: não identifica ninguém, e os reais são justamente o caso que a regra precisa acertar.
5. Comentário e mensagem de commit em português; comentário explica **por que**.
6. Leia `src/app/relatorios/EmTratamento.tsx`, `src/lib/em-tratamento.ts` e `src/app/api/reports/em-tratamento/route.ts` antes de escrever: é o padrão a seguir, inclusive visual.

---

## Task 1: A regra pura

**Files:**
- Create: `src/lib/estetica-relatorio.ts`
- Test: `__tests__/lib/estetica-relatorio.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// __tests__/lib/estetica-relatorio.test.ts
import {
  chaveProcedimento, agruparPorProcedimento, ehFinalizado,
  type SessaoEstetica,
} from '@/lib/estetica-relatorio'

// Nome de procedimento é real de propósito: é o caso que a regra tem de
// acertar. Nome de paciente é inventado.
const sessao = (over: Partial<SessaoEstetica>): SessaoEstetica => ({
  id: 1, patientId: 1, patientName: 'Fulana de Tal',
  procedimento: 'T-SCULPTOR', totalSessoes: 6, feitas: 0,
  inicio: '2026-09-01', ultimaFeita: null, ...over,
})

describe('chaveProcedimento', () => {
  it('junta as variações que a clínica digita de verdade', () => {
    const k = chaveProcedimento('T-SCULPTOR')
    expect(chaveProcedimento('T-sculptor')).toBe(k)
    expect(chaveProcedimento('T- SCULPTOR')).toBe(k)
    expect(chaveProcedimento('T-SCULPTOR ')).toBe(k)
    expect(chaveProcedimento('Blindagem Capilar ')).toBe(chaveProcedimento('Blindagem capilar'))
  })

  it('NÃO junta procedimentos que são diferentes de verdade', () => {
    // Confirmado pelo dono: são técnicas diferentes.
    expect(chaveProcedimento('Criolipólise de Placas'))
      .not.toBe(chaveProcedimento('Criolipolise Dinâmica'))
    expect(chaveProcedimento('Protocolo Blindagem'))
      .not.toBe(chaveProcedimento('Blindagem Capilar'))
  })
})

describe('agruparPorProcedimento', () => {
  it('exibe a grafia mais usada, não uma inventada', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 2, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 3, procedimento: 'T-sculptor' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].nome).toBe('T-SCULPTOR')
  })

  it('no empate usa a primeira em ordem alfabética, para a aba não trocar de nome sozinha', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, procedimento: 'T-sculptor' }),
      sessao({ id: 2, procedimento: 'T-SCULPTOR' }),
    ])
    expect(grupos[0].nome).toBe('T-SCULPTOR')
  })

  it('conta PACIENTES distintos, não sessões', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 7, procedimento: 'Fortalize' }),
      sessao({ id: 2, patientId: 7, procedimento: 'Fortalize ' }),
      sessao({ id: 3, patientId: 8, procedimento: 'Fortalize' }),
    ])
    expect(grupos[0].pacientes).toBe(2)
  })

  it('devolve os procedimentos em ordem alfabética', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 2, procedimento: 'Blindagem Capilar' }),
      sessao({ id: 3, procedimento: 'DEPILAÇÃO A LASER' }),
    ])
    expect(grupos.map(g => g.nome)).toEqual(['Blindagem Capilar', 'DEPILAÇÃO A LASER', 'T-SCULPTOR'])
  })

  it('separa em aberto de finalizados, cada bloco em ordem alfabética', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 1, patientName: 'Zulmira', feitas: 6, totalSessoes: 6 }),
      sessao({ id: 2, patientId: 2, patientName: 'Amanda', feitas: 6, totalSessoes: 6 }),
      sessao({ id: 3, patientId: 3, patientName: 'Beatriz', feitas: 3, totalSessoes: 6 }),
    ])
    expect(grupos[0].emAberto.map(s => s.patientName)).toEqual(['Beatriz'])
    expect(grupos[0].finalizados.map(s => s.patientName)).toEqual(['Amanda', 'Zulmira'])
  })

  it('os 15 nomes que existem hoje viram 9 procedimentos', () => {
    // Medido na produção em 23/10/2026. Se este número mudar sem alguém ter
    // mexido na regra, é sinal de que a normalização mudou de comportamento.
    const reais = [
      'Blindagem Capilar', 'Blindagem Capilar ', 'Blindagem capilar ',
      'T-SCULPTOR', 'T-sculptor', 'T- SCULPTOR', 'T-SCULPTOR ',
      'Fortalize', 'Fortalize ',
      'Criolipolise ', 'Criolipólise de Placas', 'Criolipolise Dinâmica ',
      'Protocolo Blindagem ', 'Radiofrequência ', 'DEPILAÇÃO A LASER',
    ]
    const grupos = agruparPorProcedimento(
      reais.map((procedimento, i) => sessao({ id: i + 1, patientId: i + 1, procedimento })),
    )
    expect(grupos).toHaveLength(9)
  })
})

describe('ehFinalizado', () => {
  it('é finalizado quando fez tudo, ou mais', () => {
    expect(ehFinalizado({ feitas: 6, totalSessoes: 6 })).toBe(true)
    // Sessão a mais registrada por engano não pode deixar o paciente preso
    // em "em aberto".
    expect(ehFinalizado({ feitas: 7, totalSessoes: 6 })).toBe(true)
  })

  it('é aberto quando falta sessão', () => {
    expect(ehFinalizado({ feitas: 3, totalSessoes: 6 })).toBe(false)
    expect(ehFinalizado({ feitas: 0, totalSessoes: 6 })).toBe(false)
  })

  it('sem meta de sessões, fica em aberto — não se finaliza o que não tem meta', () => {
    expect(ehFinalizado({ feitas: 0, totalSessoes: 0 })).toBe(false)
    expect(ehFinalizado({ feitas: 3, totalSessoes: 0 })).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/lib/estetica-relatorio.test.ts --selectProjects lib`

- [ ] **Step 3: Escrever `src/lib/estetica-relatorio.ts`**

```ts
// A regra da aba Relatórios › Estética. PURA: nada de banco, nada de React —
// é aqui que o agrupamento por procedimento pode ser testado contra os nomes
// que a clínica digita de verdade.

/** Uma linha de `aesthetic_sessions` já com o que a tela precisa. */
export interface SessaoEstetica {
  id: number
  patientId: number
  patientName: string
  /** Como foi digitado no card. */
  procedimento: string
  totalSessoes: number
  feitas: number
  /** `start_date`, como veio do banco. */
  inicio: string | null
  /** `completed_at` da última sessão realizada, ou null. */
  ultimaFeita: string | null
}

export interface GrupoProcedimento {
  chave: string
  /** A grafia mais usada entre as variantes — nunca uma inventada. */
  nome: string
  /** Pacientes DISTINTOS, não sessões: é o número que o dono lê na aba. */
  pacientes: number
  emAberto: SessaoEstetica[]
  finalizados: SessaoEstetica[]
}

/**
 * A chave que decide se dois procedimentos são o mesmo: sem acento, minúsculo,
 * e **sem nada que não seja letra ou número**.
 *
 * NÃO reusa `chaveNome` de `implantes.ts`, que é a regra de "é a mesma
 * pessoa?": ela preserva a pontuação e só colapsa espaço, então `T- SCULPTOR` e
 * `T-SCULPTOR` cairiam em grupos diferentes — e os dois existem no banco hoje,
 * digitados pela mesma pessoa para o mesmo aparelho. Nome de pessoa e nome de
 * procedimento são problemas diferentes: num nome, a pontuação quase não varia;
 * num procedimento digitado entre atendimentos, ela é ruído.
 *
 * O que a regra NÃO faz, de propósito: juntar palavras diferentes.
 * `Criolipólise de Placas` e `Criolipolise Dinâmica` continuam separadas — o
 * dono confirmou que são técnicas diferentes, e adivinhar semelhança é o erro
 * que já duplicou card neste sistema.
 */
export function chaveProcedimento(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** Fez todas as sessões contratadas? Sem meta (zero ou ausente) nunca
 *  finaliza: não se conclui o que não tem quantidade combinada. */
export function ehFinalizado(s: { feitas: number; totalSessoes: number }): boolean {
  if (!s.totalSessoes || s.totalSessoes <= 0) return false
  return s.feitas >= s.totalSessoes
}

const porNome = (a: SessaoEstetica, b: SessaoEstetica) =>
  a.patientName.localeCompare(b.patientName, 'pt-BR')

/**
 * Agrupa as sessões por procedimento e separa quem está em aberto de quem
 * finalizou. A ordem é alfabética nos dois níveis, e por um motivo: ordenar por
 * volume faria as sub-abas trocarem de lugar conforme o movimento da clínica, e
 * quem usa a tela toda semana decora a posição.
 */
export function agruparPorProcedimento(sessoes: SessaoEstetica[]): GrupoProcedimento[] {
  const grupos = new Map<string, { grafias: string[]; sessoes: SessaoEstetica[] }>()

  for (const s of sessoes) {
    const chave = chaveProcedimento(s.procedimento)
    if (!chave) continue // procedimento sem nome legível não vira aba
    const g = grupos.get(chave) ?? { grafias: [], sessoes: [] }
    g.grafias.push(s.procedimento.trim())
    g.sessoes.push(s)
    grupos.set(chave, g)
  }

  return [...grupos.entries()]
    .map(([chave, { grafias, sessoes: doGrupo }]) => ({
      chave,
      nome: grafiaMaisUsada(grafias),
      pacientes: new Set(doGrupo.map(s => s.patientId)).size,
      emAberto: doGrupo.filter(s => !ehFinalizado(s)).sort(porNome),
      finalizados: doGrupo.filter(s => ehFinalizado(s)).sort(porNome),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** A grafia que mais aparece. Empate resolve pela ordem alfabética, para o
 *  nome da aba não mudar sozinho quando entra um registro novo. */
function grafiaMaisUsada(grafias: string[]): string {
  const contagem = new Map<string, number>()
  for (const g of grafias) contagem.set(g, (contagem.get(g) ?? 0) + 1)
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0]
}
```

- [ ] **Step 4: Rodar e ver passar; provar que pega regressão**

Run: `npx jest __tests__/lib/estetica-relatorio.test.ts --selectProjects lib` → PASS.

Depois troque `replace(/[^a-z0-9]+/g, '')` por `replace(/\s+/g, ' ').trim()` (ou seja, volte ao comportamento de `chaveNome`), confirme que o teste das variantes de T-Sculptor e o dos 9 procedimentos quebram, e desfaça.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(estetica): regra de agrupamento por procedimento" -- src/lib/estetica-relatorio.ts __tests__/lib/estetica-relatorio.test.ts
```

---

## Task 2: A consulta

**Files:**
- Create: `src/lib/estetica-relatorio-db.ts`

- [ ] **Step 1: Escrever**

```ts
import sql, { initSchema } from './db'
import type { SessaoEstetica } from './estetica-relatorio'

// A consulta da aba Relatórios › Estética. Uma ida ao banco; agrupar por
// procedimento é trabalho da função pura (`estetica-relatorio.ts`), onde a
// regra pode ser testada sem banco.

export async function listarSessoesEstetica(): Promise<SessaoEstetica[]> {
  await initSchema()
  return sql<SessaoEstetica[]>`
    SELECT
      s.id,
      s.patient_id          AS "patientId",
      p.name                AS "patientName",
      s.procedure_name      AS procedimento,
      s.total_sessions      AS "totalSessoes",
      COUNT(c.id)::int      AS feitas,
      s.start_date          AS inicio,
      MAX(c.completed_at)   AS "ultimaFeita"
    FROM aesthetic_sessions s
    JOIN patients p ON p.id = s.patient_id
    LEFT JOIN aesthetic_session_completions c ON c.aesthetic_session_id = s.id
    -- Paciente apagado ou arquivado sai do relatório: a aba é para cobrar
    -- sessão de quem ainda é paciente da clínica.
    WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
    GROUP BY s.id, p.name
  `
}
```

Confirme, lendo `src/lib/db.ts`, que `patients` tem mesmo `deleted_at` e `archived_at` (as outras consultas do projeto usam os dois). Se algum não existir, tire da cláusula em vez de inventar.

- [ ] **Step 2: Conferir e commitar**

Run: `npx tsc --noEmit` — nenhum erro novo.

```bash
git commit -m "feat(estetica): consulta das sessoes para o relatorio" -- src/lib/estetica-relatorio-db.ts
```

---

## Task 3: A rota

**Files:**
- Create: `src/app/api/reports/estetica/route.ts`

Copie a forma de `src/app/api/reports/em-tratamento/route.ts`, inclusive o `export const dynamic = 'force-dynamic'`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listarSessoesEstetica } from '@/lib/estetica-relatorio-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarSessoesEstetica())
}
```

- [ ] **Step 1: Escrever, conferir e commitar**

Run: `npx tsc --noEmit` — nenhum erro novo.

```bash
git commit -m "feat(estetica): rota do relatorio de estetica" -- src/app/api/reports/estetica
```

---

## Task 4: A aba

**Files:**
- Create: `src/app/relatorios/Estetica.tsx`
- Modify: `src/app/relatorios/RelatoriosClient.tsx`

Esta task traz especificação, não JSX literal: o que não pode variar são os textos, a origem dos dados e as regras de ordenação. A aparência segue `EmTratamento.tsx` — **não invente estilo novo**.

- [ ] **Step 1: O componente**

`'use client'`, sem props. No `useEffect`, busca `/api/reports/estetica`, trata erro e estado de carregando como o `EmTratamento` faz.

Com os dados, chama `agruparPorProcedimento` e renderiza:

- **Sub-abas**: um botão por grupo, rótulo `${nome} (${pacientes})`, no mesmo visual das sub-abas do "Em tratamento" (violeta no selecionado). A primeira da lista vem selecionada.
- **Bloco "Em aberto"** e **bloco "Finalizados"**, cada um com o seu título e a contagem. Bloco vazio mostra uma linha dizendo que não há ninguém, em vez de sumir — some dá a impressão de tela quebrada.
- **Cada linha**: nome do paciente como `<Link href={`/pacientes/${patientId}`}>`, o progresso `${feitas} de ${totalSessoes}`, a data de início e a da última sessão (`—` quando não houver). Datas em `dd/mm/aaaa`; use `new Date(valor)` e **nunca** método de string, porque o postgres.js devolve `Date` nessas colunas.
- **Vazio geral**: sem nenhum grupo, uma mensagem única ("Nenhum procedimento de estética cadastrado ainda.") e nenhuma sub-aba.

- [ ] **Step 2: Registrar a aba**

Em `src/app/relatorios/RelatoriosClient.tsx`: acrescente `'estetica'` ao tipo `Tab`, `{ key: 'estetica', label: '✨ Estética' }` à lista de abas (depois de "Em tratamento") e `{tab === 'estetica' && <Estetica />}` junto dos outros.

- [ ] **Step 3: Conferir e commitar**

Run: `npx tsc --noEmit` — nenhum erro novo.
Run: `npx jest` — só as pré-existentes.

```bash
git commit -m "feat(estetica): aba Estetica no Relatorios, por procedimento" -- src/app/relatorios
```

---

## Task 5: Revisão final

- [ ] **Step 1:** `npx jest` e `npx tsc --noEmit` — só as falhas pré-existentes.
- [ ] **Step 2:** Confirme, lendo o diff, que nenhum nome de paciente real entrou.
- [ ] **Step 3:** Confirme que a lista de procedimentos **não** está escrita em lugar nenhum do código — ela tem de sair sempre dos dados, senão o pedido ("procedimento novo já aparece") não está cumprido.

---

## Depois

Merge em `master`, push, e verificar o deploy pelo hash de `https://jornada-paciente.onrender.com/login` até mudar e ficar estável em 3 requisições.

Avisar o dono de duas coisas: que `Criolipólise de Placas`, `Criolipolise Dinâmica` e `Criolipolise` aparecem como três abas (ele confirmou que são diferentes, mas vale ver na tela), e que procedimento interrompido no meio continua em "em aberto" porque não existe botão de encerrar.
