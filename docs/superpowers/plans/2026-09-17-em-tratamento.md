# Em tratamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Em tratamento" em Relatórios que lista quem está em tratamento, com etiqueta verde/amarela/vermelha pela última aplicação, mensagem semanal pronta para copiar e marcação de "mensagem enviada" por semana.

**Architecture:** As regras (quem está em tratamento, etiqueta, semana, primeiro nome, textos, ordem) ficam num módulo puro testado sem banco. Um módulo de servidor faz a consulta e grava as marcações numa tabela nova. Duas rotas de API expõem isso, e um componente cliente monta a aba.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-17-em-tratamento-design.md](../specs/2026-09-17-em-tratamento-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/em-tratamento.ts` | **Novo.** Regras puras: classificação, datas em Brasília, primeiro nome, textos, ordem das sub-abas. Sem banco, sem React. |
| `__tests__/lib/em-tratamento.test.ts` | **Novo.** |
| `src/lib/db.ts` | Cria a tabela `treatment_messages` em `runMigrations()`. |
| `src/lib/em-tratamento-db.ts` | **Novo.** Consulta a lista e grava/apaga marcações. Só servidor. |
| `src/app/api/reports/em-tratamento/route.ts` | **Novo.** `GET` da lista. |
| `src/app/api/reports/em-tratamento/enviada/route.ts` | **Novo.** `POST` marca, `DELETE` desfaz. |
| `src/app/relatorios/EmTratamento.tsx` | **Novo.** A aba. |
| `__tests__/components/EmTratamento.test.tsx` | **Novo.** |
| `src/app/relatorios/RelatoriosClient.tsx` | Registra a aba. |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Nenhum passo deste plano chama `initSchema()` localmente nem grava nada no banco. A tabela nova nasce no deploy.
- **Scripts `.mts` de conferência:** rode com `node --env-file=.env.local arquivo.mts` na raiz. Eles **não** conseguem importar `src/lib/stock.ts` nem `src/lib/db.ts`. Importe `postgres` direto e módulos puros com a extensão `.ts` explícita. Apague o script ao terminar.
- **Brasília é UTC-3 fixo**, sem horário de verão desde 2019. O banco guarda em UTC.
- **`npx jest` já tem 4 suítes vermelhas antes deste trabalho**: `task-definitions`, `task-completions`, `patients` e `PatientCard`. `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore esses, só não aumente a lista.
- **O ESLint do projeto não está configurado.** Não tente rodá-lo.
- `import sql, { initSchema } from '@/lib/db'` é o padrão de import do banco. `logAudit` fica em `@/lib/audit`.
- Folha finalizada = `patient_files.file_type = 'prescription'` com `deleted_at IS NULL`. **Não** confundir com `'prescricao'` (aba Prescrições) nem `'evolution'` (foto semanal da tabela).

---

## Task 1: Regras puras

**Files:**
- Create: `src/lib/em-tratamento.ts`
- Test: `__tests__/lib/em-tratamento.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/em-tratamento.test.ts`:

```typescript
// __tests__/lib/em-tratamento.test.ts
import {
  ETIQUETAS, MENSAGENS,
  dataBrasilia, diasEntre, inicioDaSemanaBrasilia,
  classificar, primeiroNome, mensagemPara, listarSubAba,
  type PacienteEmTratamento,
} from '@/lib/em-tratamento'

// Quinta-feira, 17/09/2026, 12:00 em Brasília.
const AGORA = new Date('2026-09-17T15:00:00Z')

describe('datas em Brasília', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    // 23:30 de 09/09 em Brasília já é 10/09 em UTC.
    expect(dataBrasilia(new Date('2026-09-10T02:30:00Z'))).toBe('2026-09-09')
    expect(dataBrasilia(new Date('2026-09-10T03:00:00Z'))).toBe('2026-09-10')
  })

  it('conta dias de calendário, não horas', () => {
    expect(diasEntre(new Date('2026-09-16T23:00:00Z'), AGORA)).toBe(1) // 16/09 20h BRT
    expect(diasEntre(new Date('2026-09-17T03:00:00Z'), AGORA)).toBe(0) // 17/09 00h BRT
  })

  it('a semana começa na segunda-feira de Brasília', () => {
    expect(inicioDaSemanaBrasilia(AGORA)).toBe('2026-09-14')
    // Domingo 20/09 às 23h em Brasília (segunda 02h em UTC) ainda é a mesma semana.
    expect(inicioDaSemanaBrasilia(new Date('2026-09-21T02:00:00Z'))).toBe('2026-09-14')
    // Segunda 21/09 à meia-noite de Brasília já é a semana seguinte.
    expect(inicioDaSemanaBrasilia(new Date('2026-09-21T03:00:00Z'))).toBe('2026-09-21')
  })
})

describe('classificar', () => {
  const saida = (iso: string) => new Date(iso)

  it('sem nenhuma saída, não está em tratamento', () => {
    expect(classificar(null, null, AGORA)).toBeNull()
  })

  it('verde até 7 dias, contando o mesmo dia da semana anterior', () => {
    expect(classificar(saida('2026-09-17T13:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 0 })
    expect(classificar(saida('2026-09-10T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 7 })
  })

  it('amarela de 8 a 28 dias', () => {
    expect(classificar(saida('2026-09-09T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'amarela', diasSemVir: 8 })
    expect(classificar(saida('2026-08-20T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'amarela', diasSemVir: 28 })
  })

  it('vermelha a partir de 29 dias', () => {
    expect(classificar(saida('2026-08-19T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'vermelha', diasSemVir: 29 })
  })

  it('usa o dia de Brasília da aplicação: 23:30 de 09/09 são 8 dias, não 7', () => {
    expect(classificar(saida('2026-09-10T02:30:00Z'), null, AGORA)?.etiqueta).toBe('amarela')
  })

  it('folha finalizada depois da última aplicação encerra o tratamento', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA)).toBeNull()
  })

  it('folha no mesmo dia, DEPOIS da aplicação, encerra', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-10T18:00:00Z'), AGORA)).toBeNull()
  })

  it('aplicação depois da folha é um novo ciclo: volta ao tratamento', () => {
    expect(classificar(saida('2026-09-15T12:00:00Z'), saida('2026-08-01T12:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'verde', diasSemVir: 2 })
  })

  it('folha e aplicação no mesmo instante contam como encerrado', () => {
    const t = saida('2026-09-10T12:00:00Z')
    expect(classificar(t, new Date(t), AGORA)).toBeNull()
  })
})

describe('primeiroNome', () => {
  it('pega o primeiro nome e acerta a caixa', () => {
    expect(primeiroNome('ANA CAROLINE CAIXETA SILVA')).toBe('Ana')
    expect(primeiroNome('  joão pedro')).toBe('João')
    expect(primeiroNome('Érica Magalhães')).toBe('Érica')
  })

  it('nome vazio vira vazio', () => {
    expect(primeiroNome('')).toBe('')
    expect(primeiroNome('   ')).toBe('')
  })
})

describe('mensagens', () => {
  it('há um texto para cada etiqueta, todos diferentes e com {nome}', () => {
    expect(ETIQUETAS).toEqual(['verde', 'amarela', 'vermelha'])
    const textos = ETIQUETAS.map(e => MENSAGENS[e])
    expect(new Set(textos).size).toBe(3)
    for (const t of textos) expect(t).toContain('{nome}')
  })

  it('preenche o primeiro nome', () => {
    expect(mensagemPara('verde', 'MARIA SOUZA')).toMatch(/^Oi, Maria! /)
    expect(mensagemPara('amarela', 'maria souza')).toContain('não veio nesta semana')
    expect(mensagemPara('vermelha', 'Maria')).toContain('Sentimos sua falta')
  })

  it('não deixa sobrar {nome} no texto', () => {
    for (const e of ETIQUETAS) expect(mensagemPara(e, 'Ana')).not.toContain('{nome}')
  })
})

describe('listarSubAba', () => {
  const p = (patientId: number, nome: string, diasSemVir: number): PacienteEmTratamento => ({
    patientId, nome, diasSemVir,
    etiqueta: diasSemVir <= 7 ? 'verde' : diasSemVir <= 28 ? 'amarela' : 'vermelha',
    ultimaAplicacao: '2026-09-01T12:00:00.000Z',
    enviada: null,
  })
  const lista = [p(1, 'Bruno', 3), p(2, 'Ana', 40), p(3, 'Carla', 10), p(4, 'Alice', 1), p(5, 'Davi', 40)]

  it('Todos: mais dias sem vir primeiro, empate por nome', () => {
    expect(listarSubAba(lista, 'todos').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla', 'Bruno', 'Alice'])
  })

  it('Não veio: só amarelas e vermelhas, por urgência', () => {
    expect(listarSubAba(lista, 'nao_veio').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla'])
  })

  it('Veio: só verdes, por nome', () => {
    expect(listarSubAba(lista, 'veio').map(x => x.nome)).toEqual(['Alice', 'Bruno'])
  })

  it('não altera a lista original', () => {
    const antes = lista.map(x => x.patientId)
    listarSubAba(lista, 'todos')
    expect(lista.map(x => x.patientId)).toEqual(antes)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest __tests__/lib/em-tratamento.test.ts`
Expected: FAIL — `Cannot find module '@/lib/em-tratamento'`

- [ ] **Step 3: Implementar**

Criar `src/lib/em-tratamento.ts`:

```typescript
// Regras da aba Relatórios › Em tratamento. Puro de propósito — sem banco e
// sem React — para as fronteiras (7, 8, 28, 29 dias; virada de dia em
// Brasília) serem testadas sem depender de relógio nem de dados.

export const ETIQUETAS = ['verde', 'amarela', 'vermelha'] as const
export type Etiqueta = (typeof ETIQUETAS)[number]

export type SubAba = 'todos' | 'nao_veio' | 'veio'

export const DIAS_VERDE = 7    // veio nos últimos 7 dias
export const DIAS_AMARELA = 28 // acima disso, crítico

export interface MarcacaoEnviada {
  template: Etiqueta
  sentBy: string | null
  sentAt: string // ISO
}

export interface PacienteEmTratamento {
  patientId: number
  nome: string
  ultimaAplicacao: string // ISO
  etiqueta: Etiqueta
  diasSemVir: number
  enviada: MarcacaoEnviada | null
}

// Os textos ainda vão ser revistos pelo dono — mudar um texto é só aqui.
export const MENSAGENS: Record<Etiqueta, string> = {
  verde:
    'Oi, {nome}! Tudo bem? 😊 Como você passou depois das suas aplicações? ' +
    'Está se sentindo bem? Qualquer dúvida, estamos por aqui.',
  amarela:
    'Oi, {nome}! Tudo bem? Percebemos que você não veio nesta semana. ' +
    'É muito importante manter suas aplicações semanais para o tratamento ' +
    'continuar dando resultado. Podemos agendar seu próximo horário?',
  vermelha:
    'Oi, {nome}! Tudo bem? Sentimos sua falta — já faz algumas semanas que ' +
    'você não vem às suas aplicações. Para o tratamento dar resultado, é muito ' +
    'importante retomar. Podemos agendar seu horário para esta semana?',
}

// Brasília é UTC-3 fixo desde 2019 (sem horário de verão). O banco guarda em
// UTC: sem este ajuste, uma aplicação às 22h viraria o dia seguinte.
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

/** "AAAA-MM-DD" do dia em Brasília. */
export function dataBrasilia(instante: Date): string {
  return new Date(instante.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 10)
}

/** Dias de calendário (em Brasília) entre dois instantes. */
export function diasEntre(anterior: Date, agora: Date): number {
  const a = Date.parse(`${dataBrasilia(anterior)}T00:00:00Z`)
  const b = Date.parse(`${dataBrasilia(agora)}T00:00:00Z`)
  return Math.round((b - a) / DIA_MS)
}

/** Segunda-feira ("AAAA-MM-DD") da semana de Brasília que contém `agora`. */
export function inicioDaSemanaBrasilia(agora: Date): string {
  const dia = new Date(`${dataBrasilia(agora)}T00:00:00Z`)
  const recuo = (dia.getUTCDay() + 6) % 7 // domingo=0 → 6 dias até a segunda
  return new Date(dia.getTime() - recuo * DIA_MS).toISOString().slice(0, 10)
}

/**
 * `null` quando o paciente não está em tratamento: nunca teve aplicação, ou a
 * folha de prescrição finalizada veio depois da última aplicação. Uma
 * aplicação depois da folha é um novo ciclo e o traz de volta.
 */
export function classificar(
  ultimaSaida: Date | null,
  ultimaFolha: Date | null,
  agora: Date,
): { etiqueta: Etiqueta; diasSemVir: number } | null {
  if (!ultimaSaida) return null
  if (ultimaFolha && ultimaFolha.getTime() >= ultimaSaida.getTime()) return null

  const diasSemVir = diasEntre(ultimaSaida, agora)
  const etiqueta: Etiqueta =
    diasSemVir <= DIAS_VERDE ? 'verde' : diasSemVir <= DIAS_AMARELA ? 'amarela' : 'vermelha'
  return { etiqueta, diasSemVir }
}

/** "ANA CAROLINE" → "Ana". */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  if (!primeiro) return ''
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR')
}

export function mensagemPara(etiqueta: Etiqueta, nomeCompleto: string): string {
  return MENSAGENS[etiqueta].replace('{nome}', primeiroNome(nomeCompleto))
}

/**
 * "Veio" em ordem de nome. "Não veio" e "Todos" por urgência: quem está há
 * mais dias sem vir primeiro — os críticos precisam aparecer antes.
 */
export function listarSubAba(lista: PacienteEmTratamento[], subAba: SubAba): PacienteEmTratamento[] {
  const porNome = (a: PacienteEmTratamento, b: PacienteEmTratamento) => a.nome.localeCompare(b.nome, 'pt-BR')

  if (subAba === 'veio') {
    return lista.filter(p => p.etiqueta === 'verde').sort(porNome)
  }
  const base = subAba === 'nao_veio' ? lista.filter(p => p.etiqueta !== 'verde') : [...lista]
  return base.sort((a, b) => b.diasSemVir - a.diasSemVir || porNome(a, b))
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest __tests__/lib/em-tratamento.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/em-tratamento.ts __tests__/lib/em-tratamento.test.ts && git commit -m "feat(relatorios): regras da aba Em tratamento"
```

---

## Task 2: Tabela e consulta no banco

**Files:**
- Modify: `src/lib/db.ts` (final de `runMigrations()`)
- Create: `src/lib/em-tratamento-db.ts`

Não há harness de teste de banco no projeto. A verificação desta task é um script **somente leitura** contra o banco real (Step 4).

- [ ] **Step 1: Criar a tabela na migração**

Em `src/lib/db.ts`, no **final** de `runMigrations()`, logo antes da `}` que fecha a função (depois do `ALTER TABLE patient_users ALTER COLUMN email DROP NOT NULL`), acrescentar:

```typescript

  // Relatórios › Em tratamento: marcação de "mensagem enviada", uma por
  // paciente por semana (segunda-feira em Brasília).
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS treatment_messages (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      template TEXT NOT NULL,
      sent_by TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (patient_id, week_start)
    )
  `).catch(() => {})
```

- [ ] **Step 2: Criar o módulo de servidor**

Criar `src/lib/em-tratamento-db.ts`:

```typescript
import sql, { initSchema } from '@/lib/db'
import {
  classificar, inicioDaSemanaBrasilia,
  type Etiqueta, type MarcacaoEnviada, type PacienteEmTratamento,
} from './em-tratamento'

interface Linha {
  patient_id: number
  name: string
  ultima_saida: Date | string
  ultima_folha: Date | string | null
  template: Etiqueta | null
  sent_by: string | null
  sent_at: Date | string | null
}

const iso = (d: Date | string) => new Date(d).toISOString()

export async function listarEmTratamento(agora = new Date()): Promise<PacienteEmTratamento[]> {
  await initSchema()
  const semana = inicioDaSemanaBrasilia(agora)

  // Implante fica de fora: é semestral e tem módulo próprio. A observação
  // cobre a tela de Implantes; o nome do item cobre a saída lançada pelo
  // estoque, que não grava essa observação.
  const linhas = await sql<Linha[]>`
    WITH saidas AS (
      SELECT m.patient_id, MAX(m.created_at) AS ultima_saida
      FROM stock_movements m
      JOIN stock_items i ON i.id = m.item_id
      WHERE m.type = 'saida'
        AND m.patient_id IS NOT NULL
        AND COALESCE(m.observation, '') <> 'Implante hormonal'
        AND i.name NOT ILIKE '%implante%'
      GROUP BY m.patient_id
    ),
    folhas AS (
      SELECT patient_id, MAX(created_at) AS ultima_folha
      FROM patient_files
      WHERE file_type = 'prescription' AND deleted_at IS NULL
      GROUP BY patient_id
    )
    SELECT p.id AS patient_id, p.name, s.ultima_saida, f.ultima_folha,
           t.template, t.sent_by, t.sent_at
    FROM saidas s
    JOIN patients p
      ON p.id = s.patient_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
    LEFT JOIN folhas f ON f.patient_id = s.patient_id
    LEFT JOIN treatment_messages t
      ON t.patient_id = s.patient_id AND t.week_start = ${semana}::date
  `

  const lista: PacienteEmTratamento[] = []
  for (const l of linhas) {
    const situacao = classificar(
      new Date(l.ultima_saida),
      l.ultima_folha ? new Date(l.ultima_folha) : null,
      agora,
    )
    if (!situacao) continue
    lista.push({
      patientId: l.patient_id,
      nome: l.name,
      ultimaAplicacao: iso(l.ultima_saida),
      ...situacao,
      enviada: l.template && l.sent_at
        ? { template: l.template, sentBy: l.sent_by, sentAt: iso(l.sent_at) }
        : null,
    })
  }
  return lista
}

/** `null` quando o paciente não existe. */
export async function marcarEnviada(
  patientId: number,
  template: Etiqueta,
  sentBy: string,
  agora = new Date(),
): Promise<MarcacaoEnviada | null> {
  await initSchema()
  const semana = inicioDaSemanaBrasilia(agora)
  try {
    const [r] = await sql<{ template: Etiqueta; sent_by: string | null; sent_at: Date | string }[]>`
      INSERT INTO treatment_messages (patient_id, week_start, template, sent_by)
      VALUES (${patientId}, ${semana}::date, ${template}, ${sentBy})
      ON CONFLICT (patient_id, week_start)
      DO UPDATE SET template = EXCLUDED.template, sent_by = EXCLUDED.sent_by, sent_at = NOW()
      RETURNING template, sent_by, sent_at
    `
    return { template: r.template, sentBy: r.sent_by, sentAt: iso(r.sent_at) }
  } catch (err) {
    // 23503 = violação de chave estrangeira: paciente inexistente.
    if ((err as { code?: string }).code === '23503') return null
    throw err
  }
}

export async function desmarcarEnviada(patientId: number, agora = new Date()): Promise<void> {
  await initSchema()
  const semana = inicioDaSemanaBrasilia(agora)
  await sql`
    DELETE FROM treatment_messages
    WHERE patient_id = ${patientId} AND week_start = ${semana}::date
  `
}
```

- [ ] **Step 3: Conferir tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"`
Expected: nenhuma linha.

- [ ] **Step 4: Conferir a consulta contra o banco real (somente leitura)**

Crie `conferir-em-tratamento.mts` na raiz. Ele repete a consulta **sem** o `JOIN` em `treatment_messages`, que ainda não existe em produção, e passa o resultado pela regra real:

```typescript
import postgres from 'postgres'
import { classificar } from './src/lib/em-tratamento.ts'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 60 })
const linhas = await sql`
  WITH saidas AS (
    SELECT m.patient_id, MAX(m.created_at) AS ultima_saida
    FROM stock_movements m JOIN stock_items i ON i.id = m.item_id
    WHERE m.type = 'saida' AND m.patient_id IS NOT NULL
      AND COALESCE(m.observation, '') <> 'Implante hormonal'
      AND i.name NOT ILIKE '%implante%'
    GROUP BY m.patient_id
  ),
  folhas AS (
    SELECT patient_id, MAX(created_at) AS ultima_folha FROM patient_files
    WHERE file_type = 'prescription' AND deleted_at IS NULL GROUP BY patient_id
  )
  SELECT p.id, p.name, s.ultima_saida, f.ultima_folha
  FROM saidas s
  JOIN patients p ON p.id = s.patient_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
  LEFT JOIN folhas f ON f.patient_id = s.patient_id`
await sql.end()

const agora = new Date()
const conta = { verde: 0, amarela: 0, vermelha: 0 }
for (const l of linhas) {
  const c = classificar(new Date(l.ultima_saida), l.ultima_folha ? new Date(l.ultima_folha) : null, agora)
  if (c) conta[c.etiqueta]++
}
console.log(conta, 'total', conta.verde + conta.amarela + conta.vermelha)
```

Run: `node --env-file=.env.local conferir-em-tratamento.mts`
Expected: por volta de `{ verde: 39, amarela: 20, vermelha: 15 }`, total perto de 74. Os números mudam a cada dia, então diferenças pequenas são normais. Um total zerado, ou muito acima de 100, indica erro na consulta. Nesse caso, pare e reporte.

Depois: `rm conferir-em-tratamento.mts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/em-tratamento-db.ts && git commit -m "feat(relatorios): consulta e marcacoes da aba Em tratamento"
```

---

## Task 3: Rotas da API

**Files:**
- Create: `src/app/api/reports/em-tratamento/route.ts`
- Create: `src/app/api/reports/em-tratamento/enviada/route.ts`

O `src/proxy.ts` já bloqueia quem não é da equipe. As rotas conferem a sessão de novo porque precisam do nome de quem marcou.

- [ ] **Step 1: Rota da lista**

Criar `src/app/api/reports/em-tratamento/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listarEmTratamento } from '@/lib/em-tratamento-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarEmTratamento())
}
```

- [ ] **Step 2: Rota da marcação**

Criar `src/app/api/reports/em-tratamento/enviada/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { ETIQUETAS, type Etiqueta } from '@/lib/em-tratamento'
import { marcarEnviada, desmarcarEnviada } from '@/lib/em-tratamento-db'

export const dynamic = 'force-dynamic'

function idValido(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : null
}

function ehEtiqueta(valor: unknown): valor is Etiqueta {
  return typeof valor === 'string' && (ETIQUETAS as readonly string[]).includes(valor)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const patientId = idValido(body?.patient_id)
  const template = body?.template
  if (!patientId || !ehEtiqueta(template)) {
    return NextResponse.json({ error: 'patient_id e template são obrigatórios' }, { status: 400 })
  }

  const userName = session.user.name ?? 'desconhecido'
  const marcacao = await marcarEnviada(patientId, template, userName)
  if (!marcacao) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })

  await logAudit({
    userName,
    action: 'mensagem_tratamento_enviada',
    entityType: 'treatment_message',
    entityId: patientId,
    patientId,
    details: `modelo ${template}`,
  })
  return NextResponse.json(marcacao, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const patientId = idValido(req.nextUrl.searchParams.get('patient_id'))
  if (!patientId) return NextResponse.json({ error: 'patient_id é obrigatório' }, { status: 400 })

  const userName = session.user.name ?? 'desconhecido'
  await desmarcarEnviada(patientId)
  await logAudit({
    userName,
    action: 'mensagem_tratamento_desfeita',
    entityType: 'treatment_message',
    entityId: patientId,
    patientId,
  })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Conferir tipos e build**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npm run build 2>&1 | grep -E "Compiled|Failed|Type error"`
Expected: `✓ Compiled successfully`. Linhas `message: '... already exists, skipping'` são avisos normais do Postgres durante o build.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/em-tratamento && git commit -m "feat(relatorios): rotas da aba Em tratamento"
```

---

## Task 4: Componente da aba

**Files:**
- Create: `src/app/relatorios/EmTratamento.tsx`
- Test: `__tests__/components/EmTratamento.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/components/EmTratamento.test.tsx`:

```typescript
// __tests__/components/EmTratamento.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmTratamento } from '@/app/relatorios/EmTratamento'
import type { PacienteEmTratamento } from '@/lib/em-tratamento'

const LISTA: PacienteEmTratamento[] = [
  { patientId: 1, nome: 'BRUNO LIMA', etiqueta: 'verde', diasSemVir: 2, ultimaAplicacao: '2026-09-15T12:00:00.000Z', enviada: null },
  { patientId: 2, nome: 'Carla Dias', etiqueta: 'amarela', diasSemVir: 10, ultimaAplicacao: '2026-09-07T12:00:00.000Z', enviada: null },
  { patientId: 3, nome: 'Ana Souza', etiqueta: 'vermelha', diasSemVir: 40, ultimaAplicacao: '2026-08-08T12:00:00.000Z', enviada: null },
]

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ template: 'amarela', sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' }) }
    }
    if (init?.method === 'DELETE') return { ok: true, status: 204, json: async () => null }
    return { ok: true, status: 200, json: async () => LISTA }
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const cards = () => screen.getAllByRole('listitem')
const nomes = () => cards().map(c => within(c).getByRole('link').textContent)

describe('EmTratamento', () => {
  it('abre em Todos, com a contagem de cada sub-aba e os críticos primeiro', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Todos (3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não veio (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Veio (1)' })).toBeInTheDocument()
    expect(nomes()).toEqual(['Ana Souza', 'Carla Dias', 'BRUNO LIMA'])
  })

  it('cada paciente mostra a etiqueta da sua situação', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const [ana, carla, bruno] = cards()
    expect(ana).toHaveTextContent('Crítico')
    expect(ana).toHaveTextContent('há 40 dias sem vir')
    expect(carla).toHaveTextContent('Faltou')
    expect(bruno).toHaveTextContent('Em dia')
    expect(bruno).not.toHaveTextContent('dias sem vir')
  })

  it('as sub-abas filtram', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: 'Veio (1)' }))
    expect(nomes()).toEqual(['BRUNO LIMA'])
    await userEvent.click(screen.getByRole('button', { name: 'Não veio (2)' }))
    expect(nomes()).toEqual(['Ana Souza', 'Carla Dias'])
  })

  it('o nome leva ao card do paciente', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(within(cards()[0]).getByRole('link')).toHaveAttribute('href', '/pacientes/3')
  })

  it('copia a mensagem certa, com o primeiro nome', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[2]).getByRole('button', { name: /Copiar mensagem/ }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Oi, Bruno! /))
    expect(await within(cards()[2]).findByRole('button', { name: /Copiada/ })).toBeInTheDocument()
  })

  it('marca como enviada, mostra quem marcou e atualiza o contador', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByText('0 de 3 mensagens enviadas nesta semana')).toBeInTheDocument()

    await userEvent.click(within(cards()[1]).getByRole('button', { name: /Marcar como enviada/ }))

    expect(await within(cards()[1]).findByText(/Enviada por Carlos/)).toBeInTheDocument()
    expect(screen.getByText('1 de 3 mensagens enviadas nesta semana')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')
    expect(JSON.parse(String(post[1].body))).toEqual({ patient_id: 2, template: 'amarela' })
  })

  it('desfaz a marcação', async () => {
    const marcada = LISTA.map(p => p.patientId === 2
      ? { ...p, enviada: { template: 'amarela' as const, sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' } }
      : p)
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => marcada }))
    render(<EmTratamento />)
    await waitFor(() => expect(within(cards()[1]).getByText(/Enviada por Carlos/)).toBeInTheDocument())

    await userEvent.click(within(cards()[1]).getByRole('button', { name: /Desfazer/ }))

    expect(fetchMock).toHaveBeenCalledWith('/api/reports/em-tratamento/enviada?patient_id=2', { method: 'DELETE' })
    await waitFor(() => expect(within(cards()[1]).queryByText(/Enviada por/)).not.toBeInTheDocument())
  })

  it('avisa quando a lista não carrega', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    render(<EmTratamento />)
    expect(await screen.findByText(/Não foi possível carregar a lista/)).toBeInTheDocument()
  })

  it('mostra mensagem própria quando a sub-aba está vazia', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [LISTA[0]] }))
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Não veio (0)' }))
    expect(screen.getByText('Ninguém nesta lista.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest __tests__/components/EmTratamento.test.tsx`
Expected: FAIL — `Cannot find module '@/app/relatorios/EmTratamento'`

- [ ] **Step 3: Implementar**

Criar `src/app/relatorios/EmTratamento.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  listarSubAba, mensagemPara, DIAS_VERDE, DIAS_AMARELA,
  type Etiqueta, type PacienteEmTratamento, type SubAba,
} from '@/lib/em-tratamento'

const SUB_ABAS: { key: SubAba; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'nao_veio', label: 'Não veio' },
  { key: 'veio', label: 'Veio' },
]

const ETIQUETA: Record<Etiqueta, { icone: string; nome: string; classe: string }> = {
  verde: { icone: '🟢', nome: 'Em dia', classe: 'bg-green-50 text-green-800 border-green-300' },
  amarela: { icone: '🟡', nome: 'Faltou', classe: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  vermelha: { icone: '🔴', nome: 'Crítico', classe: 'bg-red-50 text-red-700 border-red-300' },
}

const FUSO = 'America/Sao_Paulo'
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: FUSO })
const momento = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })

export function EmTratamento() {
  const [lista, setLista] = useState<PacienteEmTratamento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [subAba, setSubAba] = useState<SubAba>('todos')
  const [copiado, setCopiado] = useState<number | null>(null)
  const [salvando, setSalvando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await fetch('/api/reports/em-tratamento')
      if (!res.ok) throw new Error(String(res.status))
      setLista(await res.json())
    } catch {
      setErro('Não foi possível carregar a lista. Recarregue a página.')
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function copiar(p: PacienteEmTratamento) {
    await navigator.clipboard.writeText(mensagemPara(p.etiqueta, p.nome))
    setCopiado(p.patientId)
    setTimeout(() => setCopiado(atual => (atual === p.patientId ? null : atual)), 2000)
  }

  async function alternarEnviada(p: PacienteEmTratamento) {
    setSalvando(p.patientId)
    setErro(null)
    try {
      const res = p.enviada
        ? await fetch(`/api/reports/em-tratamento/enviada?patient_id=${p.patientId}`, { method: 'DELETE' })
        : await fetch('/api/reports/em-tratamento/enviada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: p.patientId, template: p.etiqueta }),
          })
      if (!res.ok) throw new Error(String(res.status))
      const enviada = p.enviada ? null : await res.json()
      setLista(atual => atual && atual.map(x => (x.patientId === p.patientId ? { ...x, enviada } : x)))
    } catch {
      setErro('Não foi possível salvar a marcação. Tente de novo.')
    } finally {
      setSalvando(null)
    }
  }

  if (!lista) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-500">
        {erro ?? 'Carregando...'}
      </div>
    )
  }

  const visiveis = listarSubAba(lista, subAba)
  const enviadas = visiveis.filter(p => p.enviada).length
  const contagem: Record<SubAba, number> = {
    todos: lista.length,
    nao_veio: lista.filter(p => p.etiqueta !== 'verde').length,
    veio: lista.filter(p => p.etiqueta === 'verde').length,
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex gap-1 flex-wrap">
          {SUB_ABAS.map(s => (
            <button
              key={s.key}
              onClick={() => setSubAba(s.key)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                subAba === s.key ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {`${s.label} (${contagem[s.key]})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          🟢 veio nos últimos {DIAS_VERDE} dias · 🟡 {DIAS_VERDE + 1} a {DIAS_AMARELA} dias sem vir · 🔴 mais de {DIAS_AMARELA} dias
        </p>
        <p className="text-sm font-medium text-gray-700">
          {enviadas} de {visiveis.length} mensagens enviadas nesta semana
        </p>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>

      {visiveis.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">Ninguém nesta lista.</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map(p => (
            <li key={p.patientId} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/pacientes/${p.patientId}`} className="font-semibold text-gray-800 hover:text-violet-700">
                    {p.nome}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Última aplicação: {dia(p.ultimaAplicacao)}
                    {p.etiqueta !== 'verde' && ` · há ${p.diasSemVir} dias sem vir`}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${ETIQUETA[p.etiqueta].classe}`}>
                  {ETIQUETA[p.etiqueta].icone} {ETIQUETA[p.etiqueta].nome}
                </span>
              </div>

              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3">
                {mensagemPara(p.etiqueta, p.nome)}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copiar(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    copiado === p.patientId ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copiado === p.patientId ? '✅ Copiada!' : '📋 Copiar mensagem'}
                </button>
                <button
                  onClick={() => alternarEnviada(p)}
                  disabled={salvando === p.patientId}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                    p.enviada
                      ? 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      : 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                  }`}
                >
                  {p.enviada ? '↩ Desfazer' : '✓ Marcar como enviada'}
                </button>
                {p.enviada && (
                  <span className="text-xs text-green-700">
                    ✓ Enviada por {p.enviada.sentBy ?? '—'} · {momento(p.enviada.sentAt)}
                    {p.enviada.template !== p.etiqueta &&
                      ` (modelo ${ETIQUETA[p.enviada.template]?.nome.toLowerCase() ?? p.enviada.template})`}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest __tests__/components/EmTratamento.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/relatorios/EmTratamento.tsx __tests__/components/EmTratamento.test.tsx && git commit -m "feat(relatorios): tela da aba Em tratamento"
```

---

## Task 5: Registrar a aba em Relatórios

**Files:**
- Modify: `src/app/relatorios/RelatoriosClient.tsx`

- [ ] **Step 1: Import**

Logo abaixo de `import { RelatorioUltimaSemana } from '@/components/RelatorioUltimaSemana'`:

```typescript
import { EmTratamento } from './EmTratamento'
```

- [ ] **Step 2: Tipo da aba**

Trocar:

```typescript
type Tab = 'cards' | 'itens' | 'semana' | 'inativos' | 'concluidos' | 'fotos' | 'resumo_paciente' | 'termos'
```

por:

```typescript
type Tab = 'cards' | 'itens' | 'semana' | 'inativos' | 'concluidos' | 'fotos' | 'resumo_paciente' | 'termos' | 'em_tratamento'
```

- [ ] **Step 3: Botão da aba**

Em `RelatoriosClient`, no array `tabs`, logo depois de `{ key: 'resumo_paciente', label: '🗒️ Resumo do Paciente' },`:

```typescript
    { key: 'em_tratamento', label: '💊 Em tratamento' },
```

- [ ] **Step 4: Conteúdo da aba**

Logo depois de `{tab === 'resumo_paciente' && <ResumoPaciente />}`:

```tsx
      {tab === 'em_tratamento' && <EmTratamento />}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"` → só as 4 suítes pré-existentes em FAIL.
Run: `npm run build 2>&1 | grep -E "Compiled|Failed|Type error"` → `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add src/app/relatorios/RelatoriosClient.tsx && git commit -m "feat(relatorios): aba Em tratamento no menu de Relatorios"
```

---

## Verificação final

- [ ] `npx jest __tests__/lib/em-tratamento.test.ts __tests__/components/EmTratamento.test.tsx`: tudo verde
- [ ] `npx jest`: as únicas suítes em FAIL são as 4 pré-existentes
- [ ] `npx tsc --noEmit`: nenhum erro novo
- [ ] `npm run build`: passa
- [ ] O script da Task 2, Step 4, deu por volta de 39 / 20 / 15, e o arquivo foi apagado
- [ ] `git status` sem arquivos soltos, exceto `.claude/launch.json`, que já estava modificado antes
- [ ] Depois do deploy (feito pelo dono, que faz o login): em Relatórios › 💊 Em tratamento aparecem as três sub-abas com contagem, os vermelhos no topo de "Não veio", e "Marcar como enviada" sobrevive a um recarregamento da página
