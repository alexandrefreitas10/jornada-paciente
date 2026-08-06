# Treinador de Atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um módulo `/treinamento` onde a IA simula pacientes da clínica no WhatsApp para a secretária responder, e ao final entrega uma avaliação estruturada com nota por critério, erros citados literalmente e uma dica prática.

**Architecture:** Duas IAs separadas — uma barata que só interpreta o paciente a cada turno do chat, e uma forte que roda uma vez no fim e devolve a avaliação em JSON estruturado. Uma base de conhecimento cadastrada pelo admin serve de gabarito para os dois prompts, e é copiada para dentro de cada sessão (`kb_snapshot`) para que edições futuras não reescrevam julgamentos antigos. Lógica pura (nota, veto, validação) fica isolada em módulos testáveis; as chamadas de IA ficam confinadas em `patient.ts` e `evaluator.ts`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Postgres via `postgres` (postgres.js), next-auth v5, `@anthropic-ai/sdk`, Tailwind v4, Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-08-06-treinador-atendimento-design.md](../specs/2026-08-06-treinador-atendimento-design.md)

---

## Decisões de modelo

| Papel | Modelo | Por quê |
|---|---|---|
| IA-paciente | `claude-haiku-4-5` | Roda a cada turno do chat. Interpretar um personagem não exige raciocínio profundo; latência e custo importam mais. |
| IA-avaliadora | `claude-opus-5` | Roda **uma vez por sessão**. É o produto: a qualidade da avaliação é o valor do módulo, e o custo de uma chamada por treino é irrelevante. |

A spec dizia "Sonnet" para a avaliadora; subimos para Opus 5 porque é uma chamada por sessão e a avaliação é a entrega. `claude-opus-5` liga *adaptive thinking* por padrão e suporta **structured outputs** (`output_config.format`), que é o que garante o JSON válido.

Notas de API que valem para todo o plano:

- Em `claude-opus-5`, `max_tokens` limita **thinking + texto juntos**. Por isso a avaliadora usa `.stream().finalMessage()` com `max_tokens` folgado, seguindo o padrão que já existe em `src/lib/exam-summary.ts`.
- **Não** passe `temperature`, `top_p`, `top_k` nem `budget_tokens` em `claude-opus-5` — retornam 400.
- `claude-haiku-4-5` não recebe `thinking` nenhum (é modelo antigo; adaptive não existe lá). Basta omitir.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/training/types.ts` | Todos os tipos do módulo. Sem lógica. |
| `src/lib/training/scoring.ts` | Média dos 6 critérios, veto do Risco, faixa de status. Puro. |
| `src/lib/training/kb.ts` | Validar, ler e gravar a base de conhecimento; formatá-la para prompt. |
| `src/lib/training/personas.ts` | Catálogo de personas por nível/cenário e sorteio. |
| `src/lib/training/patient.ts` | Prompt e chamada da IA-paciente; detecção de quebra de personagem. |
| `src/lib/training/evaluator.ts` | Prompt, JSON Schema e chamada da IA-avaliadora; validação do retorno. |
| `src/lib/training/sessions.ts` | Acesso ao banco (sessões e mensagens). |
| `src/lib/db.ts` | +3 tabelas na migração. |
| `src/app/api/admin/treinamento/kb/route.ts` | GET/PUT da base. |
| `src/app/api/treinamento/sessions/route.ts` | POST cria sessão, GET histórico. |
| `src/app/api/treinamento/sessions/[id]/route.ts` | GET sessão + mensagens. |
| `src/app/api/treinamento/sessions/[id]/messages/route.ts` | POST responde. |
| `src/app/api/treinamento/sessions/[id]/finish/route.ts` | POST encerra e avalia. |
| `src/app/admin/treinamento/page.tsx` | Formulário da base de conhecimento. |
| `src/app/treinamento/page.tsx` | Início do treino + histórico. |
| `src/app/treinamento/[id]/page.tsx` | Chat estilo WhatsApp + relatório. |

Testes só onde há lógica pura, seguindo o que o projeto já faz (`__tests__/lib/*.test.ts` não tocam no banco).

**Duas limitações declaradas de propósito:**

1. **As tarefas 9 e 10 (telas) vêm especificadas, não pré-escritas.** As demais tarefas trazem o código completo. As telas trazem a lista exata de campos, rotas, códigos de erro e ordem de renderização, mas o markup fica a cargo de quem implementa — porque ele precisa copiar as classes Tailwind e o layout das telas que já existem no projeto, e um markup inventado aqui entraria em conflito com esse padrão.
2. **A autorização não tem teste automatizado.** A spec pedia um teste de "não-admin não lê sessão de outro". O projeto não testa rota nem banco (`__tests__/lib/patients.test.ts` é um stub), então isso ficaria isolado e sem valor. A defesa está em `src/lib/training/guard.ts` (`loadOwnedSession`, que devolve 404 e não 403 para não confirmar a existência do recurso) e precisa ser conferida manualmente com dois usuários.

---

## Task 1: Tipos e cálculo de nota

**Files:**
- Create: `src/lib/training/types.ts`
- Create: `src/lib/training/scoring.ts`
- Test: `__tests__/lib/training-scoring.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/training-scoring.test.ts`:

```typescript
// __tests__/lib/training-scoring.test.ts
import { averageOf, verdictFor, AVERAGED_CRITERIA } from '@/lib/training/scoring'
import type { Scores } from '@/lib/training/types'

function scores(partial: Partial<Scores> = {}): Scores {
  return {
    acolhimento: 7, qualificacao: 7, argumentos: 7,
    objecoes: 7, fechamento: 7, precisao: 7, risco: 10,
    ...partial,
  }
}

describe('training/scoring', () => {
  it('a média usa exatamente 6 critérios — Risco fica de fora', () => {
    expect(AVERAGED_CRITERIA).toHaveLength(6)
    expect(AVERAGED_CRITERIA).not.toContain('risco')
  })

  it('Risco não altera a média', () => {
    expect(averageOf(scores({ risco: 10 }))).toBe(7)
    expect(averageOf(scores({ risco: 0 }))).toBe(7)
  })

  it('arredonda para uma casa decimal', () => {
    // 9,7,9,8.5,9,7 => 49.5/6 = 8.25 -> arredonda para 8.3
    const s = scores({ acolhimento: 9, qualificacao: 7, argumentos: 9, objecoes: 8.5, fechamento: 9, precisao: 7 })
    expect(averageOf(s)).toBe(8.3)
  })

  it('faixas de status nos limites', () => {
    expect(verdictFor(4.9, false)).toBe('REPROVADA')
    expect(verdictFor(5.0, false)).toBe('APROVADA_COM_RESSALVA')
    expect(verdictFor(6.9, false)).toBe('APROVADA_COM_RESSALVA')
    expect(verdictFor(7.0, false)).toBe('APROVADA')
  })

  it('alerta vermelho reprova mesmo com média alta', () => {
    expect(verdictFor(9.8, true)).toBe('REPROVADA')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest __tests__/lib/training-scoring.test.ts`
Expected: FAIL — `Cannot find module '@/lib/training/scoring'`

- [ ] **Step 3: Criar os tipos**

Criar `src/lib/training/types.ts`:

```typescript
// Tipos do módulo de Treinamento de Atendimento.

export type CriterionKey =
  | 'acolhimento' | 'qualificacao' | 'argumentos'
  | 'objecoes' | 'fechamento' | 'precisao' | 'risco'

export type Scores = Record<CriterionKey, number>

export type Verdict = 'APROVADA' | 'APROVADA_COM_RESSALVA' | 'REPROVADA'

export type Outcome =
  | 'AGENDOU' | 'NAO_AGENDOU' | 'SUMIU'
  | 'PERDEU_O_PACIENTE' | 'DISPENSOU_BEM'

export type Level = 1 | 2 | 3 | 4 | 5
export type ScenarioKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J'

// --- Base de conhecimento ---

export interface Doctor {
  name: string
  nickname: string
  specialty: string
  yearsExperience: number
  education: string
  focus: string
}

export interface TrainingKb {
  doctors: Doctor[]
  consultation: {
    priceCents: number
    durationLabel: string
    includes: string[]
    returnWeeks: number
  }
  // Planos de acompanhamento. É o gabarito do cenário "consultou e não fechou
  // o protocolo" — sem isso a IA não sabe se o valor citado pela secretária existe.
  plans: { name: string; months: number; priceCents: number }[]
  payment: { methods: string[]; installments: string; discountPolicy: string }
  insurance: { accepts: boolean; note: string }
  procedures: { name: string; priceCents: number }[]
  weightLossDrugsPolicy: string
  noShowPolicy: string
  links: { site: string; instagram: string; google: string }
  redLines: string[]
  modelAnswers: string[]
}

// --- Persona sorteada para a sessão ---

export interface Persona {
  id: string
  name: string
  age: number
  story: string
  objections: string[]
  levels: Level[]
  scenarios: ScenarioKey[]
}

// --- Relatório da avaliadora ---

export interface RedFlag {
  quote: string
  redLine: string
  why: string
}

export interface Improvement {
  quote: string
  problem: string
}

export interface TrainingReport {
  outcome: Outcome
  redFlags: RedFlag[]
  scores: Scores
  rationales: Record<CriterionKey, string>
  strengths: string[]
  improvements: Improvement[]
  practicalTip: string
  nextTraining: string
}

// --- Persistência ---

export type SessionStatus = 'em_andamento' | 'encerrada' | 'avaliada'
export type MessageRole = 'paciente' | 'secretaria'

export interface TrainingMessage {
  id: number
  session_id: number
  role: MessageRole
  content: string
  position: number
  created_at: string
}

export interface TrainingSession {
  id: number
  user_id: number
  level: Level
  scenario: ScenarioKey
  persona: Persona
  kb_snapshot: TrainingKb
  status: SessionStatus
  outcome: Outcome | null
  scores: Scores | null
  average: number | null
  has_red_flag: boolean
  verdict: Verdict | null
  report: TrainingReport | null
  started_at: string
  ended_at: string | null
}
```

- [ ] **Step 4: Implementar o cálculo**

Criar `src/lib/training/scoring.ts`:

```typescript
import type { CriterionKey, Scores, Verdict } from './types'

// Os 6 critérios que entram na média. RISCO fica de fora de propósito:
// ele não puxa a nota para baixo, ele VETA a aprovação.
export const AVERAGED_CRITERIA: readonly CriterionKey[] = [
  'acolhimento', 'qualificacao', 'argumentos', 'objecoes', 'fechamento', 'precisao',
]

export function averageOf(scores: Scores): number {
  const sum = AVERAGED_CRITERIA.reduce((acc, key) => acc + scores[key], 0)
  return Math.round((sum / AVERAGED_CRITERIA.length) * 10) / 10
}

export function verdictFor(average: number, hasRedFlag: boolean): Verdict {
  if (hasRedFlag) return 'REPROVADA'
  if (average >= 7) return 'APROVADA'
  if (average >= 5) return 'APROVADA_COM_RESSALVA'
  return 'REPROVADA'
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest __tests__/lib/training-scoring.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 6: Commit**

```bash
git add src/lib/training/types.ts src/lib/training/scoring.ts __tests__/lib/training-scoring.test.ts && git commit -m "feat(treinamento): tipos do modulo e calculo de nota com veto do criterio de Risco"
```

---

## Task 2: Base de conhecimento — validação e formatação para prompt

**Files:**
- Create: `src/lib/training/kb.ts`
- Test: `__tests__/lib/training-kb.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/training-kb.test.ts`:

```typescript
// __tests__/lib/training-kb.test.ts
import { validateKb, formatKbForPrompt, EMPTY_KB } from '@/lib/training/kb'
import type { TrainingKb } from '@/lib/training/types'

const valid: TrainingKb = {
  doctors: [{
    name: 'Dra. Francielle Torres', nickname: 'Dra. Fran', specialty: 'Nutrologia',
    yearsExperience: 10, education: 'Título de especialista em Nutrologia',
    focus: 'Emagrecimento, menopausa, estética corporal',
  }],
  consultation: {
    priceCents: 90000, durationLabel: '1h30 a 2h',
    includes: ['Bioimpedância', 'Avaliação de exames', 'Planejamento alimentar com a nutricionista'],
    returnWeeks: 8,
  },
  plans: [{ name: 'Acompanhamento 6 meses', months: 6, priceCents: 600000 }],
  payment: { methods: ['PIX', 'Cartão'], installments: '3x sem juros', discountPolicy: 'Não há desconto.' },
  insurance: { accepts: false, note: 'Não atendemos convênio. Emitimos nota para reembolso.' },
  procedures: [{ name: 'Criolipólise', priceCents: 80000 }],
  weightLossDrugsPolicy: 'Só a médica avalia se há indicação, na consulta.',
  noShowPolicy: 'Sem taxa. Duas tentativas de recuperação antes de liberar o horário.',
  links: { site: 'https://exemplo.com', instagram: 'https://instagram.com/exemplo', google: 'https://g.co/exemplo' },
  redLines: ['Prometer quantidade de peso ou prazo'],
  modelAnswers: ['Entendo perfeitamente sua cautela.'],
}

describe('training/kb', () => {
  it('aceita uma base completa', () => {
    expect(() => validateKb(valid)).not.toThrow()
    expect(validateKb(valid).consultation.priceCents).toBe(90000)
  })

  it('rejeita base sem médico cadastrado', () => {
    expect(() => validateKb({ ...valid, doctors: [] })).toThrow(/médico/i)
  })

  it('rejeita preço de consulta zerado ou negativo', () => {
    expect(() => validateKb({ ...valid, consultation: { ...valid.consultation, priceCents: 0 } })).toThrow(/preço/i)
  })

  it('rejeita base sem nenhuma linha vermelha', () => {
    expect(() => validateKb({ ...valid, redLines: [] })).toThrow(/linha vermelha/i)
  })

  it('rejeita objeto que não é base de conhecimento', () => {
    expect(() => validateKb(null)).toThrow()
    expect(() => validateKb({ foo: 1 })).toThrow()
  })

  it('EMPTY_KB não passa na validação (serve só para o formulário vazio)', () => {
    expect(() => validateKb(EMPTY_KB)).toThrow()
  })

  it('formatKbForPrompt traz preço em reais, anos de experiência e linhas vermelhas', () => {
    const text = formatKbForPrompt(valid)
    expect(text).toContain('R$ 900,00')
    expect(text).toContain('10 anos')
    expect(text).toContain('Prometer quantidade de peso ou prazo')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest __tests__/lib/training-kb.test.ts`
Expected: FAIL — `Cannot find module '@/lib/training/kb'`

- [ ] **Step 3: Implementar**

Criar `src/lib/training/kb.ts`:

```typescript
import sql, { initSchema } from '@/lib/db'
import type { TrainingKb } from './types'

// Base vazia — só para pré-preencher o formulário do admin.
// NÃO passa em validateKb de propósito: sem gabarito não existe treino.
export const EMPTY_KB: TrainingKb = {
  doctors: [],
  consultation: { priceCents: 0, durationLabel: '', includes: [], returnWeeks: 8 },
  plans: [],
  payment: { methods: [], installments: '', discountPolicy: '' },
  insurance: { accepts: false, note: '' },
  procedures: [],
  weightLossDrugsPolicy: '',
  noShowPolicy: '',
  links: { site: '', instagram: '', google: '' },
  redLines: [],
  modelAnswers: [],
}

function fail(msg: string): never {
  throw new Error(msg)
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${what} inválido`)
  return value as Record<string, unknown>
}

export function validateKb(data: unknown): TrainingKb {
  const kb = asObject(data, 'Base de conhecimento') as unknown as TrainingKb

  if (!Array.isArray(kb.doctors) || kb.doctors.length === 0) {
    fail('Cadastre pelo menos um médico.')
  }
  for (const d of kb.doctors) {
    if (!d?.name?.trim()) fail('Todo médico precisa de nome.')
    if (!Number.isFinite(d.yearsExperience) || d.yearsExperience <= 0) {
      fail(`Informe os anos de experiência de ${d.name}.`)
    }
  }

  const c = asObject(kb.consultation, 'Bloco da consulta')
  if (!Number.isFinite(c.priceCents) || (c.priceCents as number) <= 0) {
    fail('Informe o preço da consulta.')
  }
  if (!Array.isArray(kb.consultation.includes) || kb.consultation.includes.length === 0) {
    fail('Liste o que está incluso na consulta — é o argumento de valor da equipe.')
  }

  if (!Array.isArray(kb.redLines) || kb.redLines.length === 0) {
    fail('Cadastre pelo menos uma linha vermelha.')
  }

  asObject(kb.payment, 'Bloco de pagamento')
  asObject(kb.insurance, 'Bloco de convênio')
  asObject(kb.links, 'Bloco de links')
  if (!Array.isArray(kb.plans)) fail('Lista de planos de tratamento inválida.')
  if (!Array.isArray(kb.procedures)) fail('Lista de procedimentos inválida.')
  if (!Array.isArray(kb.modelAnswers)) fail('Lista de respostas-modelo inválida.')

  return kb
}

export function isKbComplete(data: unknown): boolean {
  try { validateKb(data); return true } catch { return false }
}

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

// Vira texto que entra tanto no prompt do paciente (para ele rebater)
// quanto no da avaliadora (como gabarito do critério PRECISÃO).
export function formatKbForPrompt(kb: TrainingKb): string {
  const doctors = kb.doctors.map(d =>
    `- ${d.name} (chamada de "${d.nickname}") — ${d.specialty}, ${d.yearsExperience} anos de experiência. ` +
    `Formação: ${d.education}. Atua em: ${d.focus}.`
  ).join('\n')

  const procedures = kb.procedures.length
    ? kb.procedures.map(p => `- ${p.name}: ${brl(p.priceCents)}`).join('\n')
    : '- (nenhum cadastrado)'

  const plans = kb.plans.length
    ? kb.plans.map(p => `- ${p.name} (${p.months} meses): ${brl(p.priceCents)}`).join('\n')
    : '- (nenhum cadastrado)'

  return [
    '## MÉDICOS', doctors,
    '',
    '## CONSULTA',
    `Valor: ${brl(kb.consultation.priceCents)}`,
    `Duração: ${kb.consultation.durationLabel}`,
    `Retorno incluso em ${kb.consultation.returnWeeks} semanas.`,
    'Inclui:', ...kb.consultation.includes.map(i => `- ${i}`),
    '',
    '## PLANOS DE ACOMPANHAMENTO', plans,
    '',
    '## PAGAMENTO',
    `Formas: ${kb.payment.methods.join(', ')}`,
    `Parcelamento: ${kb.payment.installments}`,
    `Política de desconto: ${kb.payment.discountPolicy}`,
    '',
    '## CONVÊNIO',
    kb.insurance.accepts ? 'Atende convênio.' : 'NÃO atende convênio.',
    kb.insurance.note,
    '',
    '## PROCEDIMENTOS ESTÉTICOS', procedures,
    '',
    '## CANETAS DE EMAGRECIMENTO', kb.weightLossDrugsPolicy,
    '',
    '## NO-SHOW E REMARCAÇÃO', kb.noShowPolicy,
    '',
    '## LINKS OFICIAIS',
    `Site: ${kb.links.site}`,
    `Instagram: ${kb.links.instagram}`,
    `Google: ${kb.links.google}`,
    '',
    '## LINHAS VERMELHAS (a secretária NUNCA pode)',
    ...kb.redLines.map(r => `- ${r}`),
    '',
    '## RESPOSTAS-MODELO (a clínica quer que sejam usadas)',
    ...kb.modelAnswers.map(a => `- "${a}"`),
  ].join('\n')
}

// --- Persistência ---

export async function readKb(): Promise<TrainingKb | null> {
  await initSchema()
  const [row] = await sql<{ data: TrainingKb }[]>`
    SELECT data FROM training_kb ORDER BY id DESC LIMIT 1
  `
  return row?.data ?? null
}

export async function writeKb(data: unknown, userId: number): Promise<TrainingKb> {
  const kb = validateKb(data)
  await initSchema()
  await sql`
    INSERT INTO training_kb (data, updated_by) VALUES (${sql.json(kb as never)}, ${userId})
  `
  return kb
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest __tests__/lib/training-kb.test.ts`
Expected: PASS — 7 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/kb.ts __tests__/lib/training-kb.test.ts && git commit -m "feat(treinamento): base de conhecimento — validacao, formatacao para prompt e persistencia"
```

---

## Task 3: Migração das tabelas e acesso ao banco

**Files:**
- Modify: `src/lib/db.ts` (adicionar bloco no fim de `runMigrations()`)
- Create: `src/lib/training/sessions.ts`

Sem teste automatizado: o projeto não testa camada de banco (ver `__tests__/lib/patients.test.ts`, que é um stub).

- [ ] **Step 1: Adicionar as 3 tabelas**

Em `src/lib/db.ts`, dentro de `runMigrations()`, **depois do último `await sql.unsafe(...)` e antes do `}` que fecha a função**, acrescentar:

```typescript
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS training_kb (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      updated_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS training_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
      scenario CHAR(1) NOT NULL,
      persona JSONB NOT NULL,
      kb_snapshot JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      outcome TEXT,
      scores JSONB,
      average NUMERIC(3,1),
      has_red_flag BOOLEAN DEFAULT FALSE,
      verdict TEXT,
      report JSONB,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS training_messages (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS training_messages_session_idx
      ON training_messages (session_id, position);
    CREATE INDEX IF NOT EXISTS training_sessions_user_idx
      ON training_sessions (user_id, started_at DESC);
  `)
```

- [ ] **Step 2: Criar o acesso ao banco**

Criar `src/lib/training/sessions.ts`:

```typescript
import sql, { initSchema } from '@/lib/db'
import type {
  Level, MessageRole, Persona, ScenarioKey, TrainingKb,
  TrainingMessage, TrainingReport, TrainingSession,
} from './types'
import { averageOf, verdictFor } from './scoring'

export async function createSession(params: {
  userId: number
  level: Level
  scenario: ScenarioKey
  persona: Persona
  kb: TrainingKb
}): Promise<TrainingSession> {
  await initSchema()
  const [row] = await sql<TrainingSession[]>`
    INSERT INTO training_sessions (user_id, level, scenario, persona, kb_snapshot)
    VALUES (
      ${params.userId}, ${params.level}, ${params.scenario},
      ${sql.json(params.persona as never)}, ${sql.json(params.kb as never)}
    )
    RETURNING *
  `
  return row
}

export async function getSession(id: number): Promise<TrainingSession | null> {
  await initSchema()
  const [row] = await sql<TrainingSession[]>`SELECT * FROM training_sessions WHERE id = ${id}`
  return row ?? null
}

export async function listSessions(opts: { userId?: number; limit?: number } = {}): Promise<TrainingSession[]> {
  await initSchema()
  const limit = opts.limit ?? 50
  if (opts.userId != null) {
    return sql<TrainingSession[]>`
      SELECT * FROM training_sessions WHERE user_id = ${opts.userId}
      ORDER BY started_at DESC LIMIT ${limit}
    `
  }
  return sql<TrainingSession[]>`
    SELECT * FROM training_sessions ORDER BY started_at DESC LIMIT ${limit}
  `
}

export async function listMessages(sessionId: number): Promise<TrainingMessage[]> {
  await initSchema()
  return sql<TrainingMessage[]>`
    SELECT * FROM training_messages WHERE session_id = ${sessionId} ORDER BY position ASC
  `
}

export async function addMessages(
  sessionId: number,
  entries: { role: MessageRole; content: string }[]
): Promise<TrainingMessage[]> {
  await initSchema()
  const [{ next }] = await sql<{ next: number }[]>`
    SELECT COALESCE(MAX(position), 0) + 1 AS next FROM training_messages WHERE session_id = ${sessionId}
  `
  const saved: TrainingMessage[] = []
  for (let i = 0; i < entries.length; i++) {
    const [row] = await sql<TrainingMessage[]>`
      INSERT INTO training_messages (session_id, role, content, position)
      VALUES (${sessionId}, ${entries[i].role}, ${entries[i].content}, ${next + i})
      RETURNING *
    `
    saved.push(row)
  }
  return saved
}

// Quantas mensagens a SECRETÁRIA já mandou — é o teto de 30 da spec.
export async function countSecretariaMessages(sessionId: number): Promise<number> {
  await initSchema()
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM training_messages
    WHERE session_id = ${sessionId} AND role = 'secretaria'
  `
  return total
}

export async function markEnded(sessionId: number): Promise<void> {
  await initSchema()
  await sql`
    UPDATE training_sessions SET status = 'encerrada', ended_at = NOW()
    WHERE id = ${sessionId} AND status = 'em_andamento'
  `
}

export async function saveReport(sessionId: number, report: TrainingReport): Promise<TrainingSession> {
  await initSchema()
  const average = averageOf(report.scores)
  const hasRedFlag = report.redFlags.length > 0
  const verdict = verdictFor(average, hasRedFlag)
  const [row] = await sql<TrainingSession[]>`
    UPDATE training_sessions SET
      status = 'avaliada',
      outcome = ${report.outcome},
      scores = ${sql.json(report.scores as never)},
      average = ${average},
      has_red_flag = ${hasRedFlag},
      verdict = ${verdict},
      report = ${sql.json(report as never)},
      ended_at = COALESCE(ended_at, NOW())
    WHERE id = ${sessionId}
    RETURNING *
  `
  return row
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos em `src/lib/training/`

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/training/sessions.ts && git commit -m "feat(treinamento): tabelas training_kb/sessions/messages e camada de acesso"
```

---

## Task 4: Catálogo de personas

**Files:**
- Create: `src/lib/training/personas.ts`
- Test: `__tests__/lib/training-personas.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/training-personas.test.ts`:

```typescript
// __tests__/lib/training-personas.test.ts
import { PERSONAS, SCENARIOS, LEVELS, pickPersona } from '@/lib/training/personas'
import type { Level, ScenarioKey } from '@/lib/training/types'

describe('training/personas', () => {
  it('tem os 10 cenários e os 5 níveis', () => {
    expect(Object.keys(SCENARIOS)).toHaveLength(10)
    expect(Object.keys(LEVELS)).toHaveLength(5)
  })

  it('todo nível de 1 a 5 tem pelo menos uma persona', () => {
    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      expect(PERSONAS.some(p => p.levels.includes(level))).toBe(true)
    }
  })

  it('todo cenário de A a J tem pelo menos uma persona', () => {
    for (const key of Object.keys(SCENARIOS) as ScenarioKey[]) {
      expect(PERSONAS.some(p => p.scenarios.includes(key))).toBe(true)
    }
  })

  it('os ids das personas são únicos', () => {
    expect(new Set(PERSONAS.map(p => p.id)).size).toBe(PERSONAS.length)
  })

  it('pickPersona devolve uma persona compatível com nível e cenário', () => {
    const p = pickPersona(3, 'A')
    expect(p.levels).toContain(3)
    expect(p.scenarios).toContain('A')
  })

  it('pickPersona nunca devolve null — cai no fallback do nível se o par não existir', () => {
    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      for (const key of Object.keys(SCENARIOS) as ScenarioKey[]) {
        expect(pickPersona(level, key)).toBeTruthy()
      }
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest __tests__/lib/training-personas.test.ts`
Expected: FAIL — `Cannot find module '@/lib/training/personas'`

- [ ] **Step 3: Implementar**

Criar `src/lib/training/personas.ts`:

```typescript
import type { Level, Persona, ScenarioKey } from './types'

export const SCENARIOS: Record<ScenarioKey, string> = {
  A: 'Primeiro contato no WhatsApp (lead de Instagram/Google)',
  B: 'Pedindo preço de cara, sem mais nada',
  C: 'Quer convênio ou nota para reembolso',
  D: 'Confirmação de consulta',
  E: 'Quer desmarcar ou remarcar em cima da hora',
  F: 'Faltou e sumiu (no-show)',
  G: 'Consultou e não fechou o protocolo',
  H: 'Perguntando sobre canetas de emagrecimento (Mounjaro/Ozempic)',
  I: 'Só quer o procedimento estético, sem passar por consulta',
  J: 'Paciente insatisfeito — está em tratamento e não vê resultado',
}

export const LEVELS: Record<Level, string> = {
  1: 'Já decidiu. Só quer horário. Testa se a secretária não atrapalha.',
  2: 'Quer muito, mas o preço aperta. Pergunta parcelamento e desconto.',
  3: 'Indeciso de verdade. Compara com outros, pede prova, e SOME. Pode voltar ou não.',
  4: 'Resistente. Desconfiado, meio ríspido, questiona a competência da médica.',
  5: 'Impossível. Já foi mal atendido, ameaça reclamar publicamente, quer garantia por escrito, cita o concorrente mais barato o tempo todo.',
}

const ALL: ScenarioKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

export const PERSONAS: Persona[] = [
  {
    id: 'ana-menopausa',
    name: 'Ana Costa', age: 52,
    story: 'Ganhou 18 kg depois da menopausa. Fadiga o dia todo. Já foi numa nutróloga ano passado, gastou caro e recebeu uma dieta genérica — saiu frustrada.',
    objections: ['Já me decepcionei antes', 'Achei caro', 'Tenho que falar com meu marido', 'Vi outro profissional cobrando menos'],
    levels: [2, 3, 4], scenarios: ['A', 'B', 'C', 'G', 'J'],
  },
  {
    id: 'juliana-decidida',
    name: 'Juliana Alves', age: 34,
    story: 'Amiga fez tratamento na clínica e indicou. Já pesquisou, já viu o Instagram, já decidiu. Só quer horário e como pagar.',
    objections: ['Tem horário depois das 18h?'],
    levels: [1], scenarios: ['A', 'B', 'D', 'H'],
  },
  {
    id: 'carla-aperto',
    name: 'Carla Nunes', age: 29,
    story: 'Quer muito começar, acompanha a clínica há meses, mas o orçamento está apertado. Foca em parcelamento.',
    objections: ['Consigo parcelar?', 'Tem desconto à vista?', 'Dá pra começar mês que vem?'],
    levels: [2], scenarios: ['A', 'B', 'I'],
  },
  {
    id: 'roberto-empresario',
    name: 'Roberto Lima', age: 47,
    story: 'Empresário, agenda cheia, fala em tom apressado. Faltou na consulta e acha que a clínica é que deveria compensá-lo por isso.',
    objections: ['Meu tempo vale mais que isso', 'Só remarco com desconto', 'Não tenho o dia todo'],
    levels: [4, 5], scenarios: ['E', 'F', 'D'],
  },
  {
    id: 'patricia-cetica',
    name: 'Patrícia Rocha', age: 41,
    story: 'Pesquisou muito, desconfia de tudo. Questiona a formação da médica e pede números concretos de resultado.',
    objections: ['Quantos anos ela tem de experiência?', 'Qual a taxa de sucesso?', 'E se não der certo?'],
    levels: [3, 4], scenarios: ['A', 'G', 'J', 'H'],
  },
  {
    id: 'marcos-caneta',
    name: 'Marcos Pereira', age: 38,
    story: 'Viu no Instagram que a caneta emagrece rápido. Quer só a receita, não quer consulta. Pressiona para a secretária dizer a dose.',
    objections: ['Vocês passam a caneta?', 'Qual dose devo tomar?', 'Preciso mesmo de consulta pra isso?'],
    levels: [3, 4, 5], scenarios: ['H', 'B', 'I'],
  },
  {
    id: 'fernanda-estetica',
    name: 'Fernanda Dias', age: 31,
    story: 'Quer só criolipólise, achou o preço no Google. Não quer pagar consulta antes.',
    objections: ['Quanto é a criolipólise?', 'Por que preciso de consulta?', 'Em outro lugar já marco direto'],
    levels: [2, 3, 4], scenarios: ['I', 'B', 'C'],
  },
  {
    id: 'sandra-insatisfeita',
    name: 'Sandra Melo', age: 45,
    story: 'Está há 2 meses em tratamento, seguiu tudo, e diz que não emagreceu nada. Chateada e prestes a desistir.',
    objections: ['Paguei caro e não vi resultado', 'Quero meu dinheiro de volta', 'Vou avaliar mal no Google'],
    levels: [4, 5], scenarios: ['J', 'G', 'E'],
  },
  {
    id: 'ricardo-boss',
    name: 'Ricardo Farias', age: 50,
    story: 'Já foi mal atendido em outra clínica e chega agressivo. Xinga o preço, ameaça Reclame Aqui e print nos grupos, exige garantia por escrito. Não fecha em hipótese nenhuma — o acerto aqui é encerrar com firmeza e educação.',
    objections: ['Isso é roubo', 'Vou avaliar com 1 estrela', 'Me dá garantia por escrito', 'Fulano cobra metade'],
    levels: [5], scenarios: ALL,
  },
  {
    id: 'beatriz-reembolso',
    name: 'Beatriz Amaral', age: 36,
    story: 'Tem plano de saúde e presume que a clínica atende. Quando descobre que é particular, quer saber de nota e reembolso.',
    objections: ['Vocês atendem meu plano?', 'Emitem nota pra reembolso?', 'Quanto o plano cobre?'],
    levels: [1, 2, 3], scenarios: ['C', 'A', 'D'],
  },
  {
    id: 'luciana-confirmacao',
    name: 'Luciana Braga', age: 39,
    story: 'Tem consulta marcada. Está em cima da hora tentando remarcar por causa do trabalho, meio sem graça.',
    objections: ['Consigo mudar para outro dia?', 'Perco o valor se remarcar?'],
    levels: [1, 2, 3], scenarios: ['D', 'E', 'F'],
  },
]

// Sorteia uma persona compatível. Prioriza nível+cenário; se não houver par exato,
// cai para qualquer persona do nível. Sempre devolve alguém.
export function pickPersona(level: Level, scenario: ScenarioKey): Persona {
  const exact = PERSONAS.filter(p => p.levels.includes(level) && p.scenarios.includes(scenario))
  const pool = exact.length > 0 ? exact : PERSONAS.filter(p => p.levels.includes(level))
  const candidates = pool.length > 0 ? pool : PERSONAS
  return candidates[Math.floor(Math.random() * candidates.length)]
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest __tests__/lib/training-personas.test.ts`
Expected: PASS — 6 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/personas.ts __tests__/lib/training-personas.test.ts && git commit -m "feat(treinamento): catalogo de personas, niveis e cenarios do ramo"
```

---

## Task 5: IA-paciente

**Files:**
- Create: `src/lib/training/patient.ts`
- Test: `__tests__/lib/training-patient.test.ts`

O teste cobre só a lógica pura (detecção de quebra de personagem e o parse dos balões). A chamada à Anthropic não é testada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/training-patient.test.ts`:

```typescript
// __tests__/lib/training-patient.test.ts
import { breaksCharacter, splitBubbles, detectEnding } from '@/lib/training/patient'

describe('training/patient — quebra de personagem', () => {
  it('pega o paciente falando de si em terceira pessoa', () => {
    // O erro real observado no agente de mercado.
    expect(breaksCharacter('Mas sinceramente, Lúcia ainda está na dúvida', 'Lúcia Mendes')).toBe(true)
    expect(breaksCharacter('Ana ficou insegura com o valor', 'Ana Costa')).toBe(true)
  })

  it('não confunde o paciente se apresentando com quebra de personagem', () => {
    expect(breaksCharacter('oi, aqui é a Ana', 'Ana Costa')).toBe(false)
    expect(breaksCharacter('meu nome é Ana Costa', 'Ana Costa')).toBe(false)
  })

  it('pega vazamento de avaliação no meio da conversa', () => {
    expect(breaksCharacter('AVALIAÇÃO: 1. ACOLHIMENTO (1-10): 8', 'Ana')).toBe(true)
    expect(breaksCharacter('NOTA FINAL: 7.4/10', 'Ana')).toBe(true)
    expect(breaksCharacter('🔴 SIMULAÇÃO ENCERRADA', 'Ana')).toBe(true)
    expect(breaksCharacter('💡 DICA PRÁTICA: na próxima vez...', 'Ana')).toBe(true)
  })

  it('pega o rótulo de narrador vazando', () => {
    expect(breaksCharacter('Paciente (por WhatsApp): oi tudo bem?', 'Ana')).toBe(true)
  })

  it('deixa passar mensagem normal de paciente', () => {
    expect(breaksCharacter('oi, qnto custa a consulta?', 'Ana Costa')).toBe(false)
    expect(breaksCharacter('vcs atendem convenio??', 'Ana Costa')).toBe(false)
  })
})

describe('training/patient — balões', () => {
  it('separa balões por linha em branco', () => {
    expect(splitBubbles('oi\n\nqnto é a consulta?')).toEqual(['oi', 'qnto é a consulta?'])
  })

  it('descarta linhas vazias e espaços', () => {
    expect(splitBubbles('  oi  \n\n\n  tudo bem?  \n\n')).toEqual(['oi', 'tudo bem?'])
  })

  it('texto sem quebra vira um balão só', () => {
    expect(splitBubbles('boa tarde')).toEqual(['boa tarde'])
  })

  it('limita a 3 balões por turno', () => {
    expect(splitBubbles('a\n\nb\n\nc\n\nd\n\ne')).toHaveLength(3)
  })

  it('remove token especial vazado pelo modelo', () => {
    // Aconteceu de verdade: "Tô bem dividida ainda...<|eos|>"
    expect(splitBubbles('to bem dividida ainda...<|eos|>')).toEqual(['to bem dividida ainda...'])
  })
})

describe('training/patient — desfecho', () => {
  it('extrai o marcador de desfecho e o remove do texto', () => {
    const r = detectEnding('perfeito, pode marcar quarta as 16h entao\n[[FIM:AGENDOU]]')
    expect(r.outcome).toBe('AGENDOU')
    expect(r.text).toBe('perfeito, pode marcar quarta as 16h entao')
  })

  it('sem marcador, a conversa continua', () => {
    const r = detectEnding('e quanto custa mesmo?')
    expect(r.outcome).toBeNull()
    expect(r.text).toBe('e quanto custa mesmo?')
  })

  it('ignora marcador com desfecho inválido', () => {
    const r = detectEnding('tchau\n[[FIM:QUALQUERCOISA]]')
    expect(r.outcome).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest __tests__/lib/training-patient.test.ts`
Expected: FAIL — `Cannot find module '@/lib/training/patient'`

- [ ] **Step 3: Implementar**

Criar `src/lib/training/patient.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { formatKbForPrompt } from './kb'
import { LEVELS, SCENARIOS } from './personas'
import type { Level, Outcome, Persona, ScenarioKey, TrainingKb, TrainingMessage } from './types'

const PATIENT_MODEL = 'claude-haiku-4-5'
const MAX_BUBBLES = 3

const OUTCOMES: Outcome[] = ['AGENDOU', 'NAO_AGENDOU', 'SUMIU', 'PERDEU_O_PACIENTE', 'DISPENSOU_BEM']

// Marcadores de que a IA saiu do personagem e virou "treinador".
const LEAK_MARKERS = [
  /AVALIA[ÇC][ÃA]O\s*:/i,
  /NOTA\s+FINAL/i,
  /SIMULA[ÇC][ÃA]O/i,
  /PONTOS?\s+FORTES?/i,
  /DICA\s+PR[ÁA]TICA/i,
  /ACOLHIMENTO\s*\(/i,
  /\bPaciente\s*\([^)]*\)\s*:/i,
]

// Terceira pessoa: "<Primeiro nome> <verbo de estado>".
// Foi exatamente assim que o agente de mercado vazou ("Lúcia ainda está na dúvida").
const THIRD_PERSON_VERBS =
  '(?:ainda\\s+)?(?:está|esta|ficou|fica|acha|achou|quer|queria|vai|pensa|pensou|prefere|sente|sentiu|decidiu)'

export function breaksCharacter(text: string, personaName: string): boolean {
  if (LEAK_MARKERS.some(re => re.test(text))) return true

  const firstName = personaName.trim().split(/\s+/)[0]
  if (!firstName) return false
  // Exige que o nome NÃO venha logo depois de "a"/"o"/"é"/"chamo" — nesses
  // casos o paciente está se apresentando, não falando de si em terceira pessoa.
  const re = new RegExp(`(?<!\\b(?:a|o|é|e|sou|chamo|aqui)\\s)\\b${firstName}\\s+${THIRD_PERSON_VERBS}\\b`, 'i')
  return re.test(text)
}

// Modelos às vezes vazam token especial no texto (visto na conversa real:
// "Tô bem dividida ainda...<|eos|>"). Nunca pode chegar na tela.
const SPECIAL_TOKENS = /<\|[a-z_]+\|>/gi

export function splitBubbles(raw: string): string[] {
  return raw
    .replace(SPECIAL_TOKENS, '')
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BUBBLES)
}

export function detectEnding(raw: string): { text: string; outcome: Outcome | null } {
  const match = raw.match(/\[\[FIM:([A-Z_]+)\]\]/)
  const text = raw.replace(/\[\[FIM:[A-Z_]+\]\]/g, '').trim()
  if (!match) return { text, outcome: null }
  const candidate = match[1] as Outcome
  return { text, outcome: OUTCOMES.includes(candidate) ? candidate : null }
}

export function buildPatientSystemPrompt(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
}): string {
  const { persona, level, scenario, kb } = params
  return `Você é um PACIENTE entrando em contato com uma clínica pelo WhatsApp. Isto é um treino: do outro lado está uma secretária real praticando atendimento. Você NUNCA sai do personagem.

# QUEM VOCÊ É
Nome: ${persona.name}, ${persona.age} anos.
História: ${persona.story}
Suas objeções: ${persona.objections.map(o => `"${o}"`).join(', ')}

# SITUAÇÃO
Cenário: ${SCENARIOS[scenario]}
Nível de dificuldade ${level}: ${LEVELS[level]}

# COMO VOCÊ ESCREVE
- Como gente no WhatsApp: mensagens CURTAS, informais, sem parágrafo organizado.
- Erra digitação de vez em quando ("qnto", "vc", "obg", sem acento).
- Pode mandar 1, 2 ou no máximo 3 balões seguidos. Separe cada balão com UMA LINHA EM BRANCO.
- De vez em quando manda áudio: escreva exatamente no formato [áudio de 0:14 — transcrição: "..."].
- NUNCA escreve textão. NUNCA assina o nome no fim. NUNCA usa "Atenciosamente".
- Não facilita: só cede quando a secretária realmente merecer.

# PROIBIÇÕES ABSOLUTAS
- NUNCA avalie, comente ou dê nota ao atendimento da secretária.
- NUNCA use as palavras "simulação", "treino", "avaliação", "acolhimento", "nota".
- NUNCA fale de si em terceira pessoa. Você é ${persona.name.split(' ')[0]}; diga "eu", nunca "${persona.name.split(' ')[0]} está...".
- NUNCA escreva "Paciente:" ou qualquer rótulo antes da sua mensagem.

# QUANDO A CONVERSA ACABA
Quando o assunto chegar num desfecho natural, escreva sua última mensagem e acrescente, em uma linha separada no fim, UM destes marcadores:
[[FIM:AGENDOU]] — você marcou consulta com dia e hora.
[[FIM:NAO_AGENDOU]] — a conversa acabou sem agendamento, sem briga.
[[FIM:SUMIU]] — você decidiu parar de responder. (Só a partir do nível 3.)
[[FIM:PERDEU_O_PACIENTE]] — você foi embora irritado, ou ela desistiu de você.
[[FIM:DISPENSOU_BEM]] — você é um caso impossível e ela encerrou com firmeza e educação, sem julgar você.
Se a conversa ainda não acabou, NÃO escreva marcador nenhum.

# O QUE A CLÍNICA REALMENTE OFERECE
Use isto para rebater a secretária quando ela falar algo diferente ("mas no site de vocês diz outra coisa"). Você NÃO entrega essa informação de graça — você é o paciente, não o roteiro.

${formatKbForPrompt(kb)}`
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export class OutOfCreditsError extends Error {
  constructor() { super('Os créditos da IA acabaram. A conversa foi salva e pode ser avaliada depois.') }
}

// Saldo zerado na Anthropic volta como 400 (ou 403 de billing) — não como um erro
// dedicado. Sem esta checagem, vira "Unexpected end of JSON input" na tela.
export function isCreditError(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false
  const type = (err as { type?: string }).type
  return err.status === 400 || err.status === 403 || type === 'billing_error'
}

function toAnthropicMessages(history: TrainingMessage[]): Anthropic.MessageParam[] {
  // O paciente é o "assistant" do ponto de vista do modelo; a secretária é o "user".
  return history.map(m => ({
    role: m.role === 'paciente' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }))
}

// Gera o próximo turno do paciente. Descarta e regera uma vez se a IA quebrar o personagem.
export async function nextPatientTurn(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
  history: TrainingMessage[]
}): Promise<{ bubbles: string[]; outcome: Outcome | null }> {
  const system = buildPatientSystemPrompt(params)
  const messages = toAnthropicMessages(params.history)
  // Primeira mensagem da conversa: o paciente abre, então precisa de um turno de user.
  if (messages.length === 0 || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: '(A secretária ainda não respondeu. Abra a conversa.)' })
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      const message = await getClient().messages.create({
        model: PATIENT_MODEL,
        max_tokens: 1024,
        system,
        messages,
      })
      const block = message.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      raw = block?.text ?? ''
    } catch (err) {
      if (isCreditError(err)) throw new OutOfCreditsError()
      throw err
    }

    const { text, outcome } = detectEnding(raw)
    if (!text) continue
    if (breaksCharacter(text, params.persona.name)) continue
    const bubbles = splitBubbles(text)
    if (bubbles.length > 0) return { bubbles, outcome }
  }

  // Duas tentativas quebraram o personagem — devolve algo neutro em vez de vazar avaliação.
  return { bubbles: ['desculpa, travou aqui... vc pode repetir?'], outcome: null }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest __tests__/lib/training-patient.test.ts`
Expected: PASS — 13 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/patient.ts __tests__/lib/training-patient.test.ts && git commit -m "feat(treinamento): IA-paciente com baloes de WhatsApp e descarte de quebra de personagem"
```

---

## Task 6: IA-avaliadora

**Files:**
- Create: `src/lib/training/evaluator.ts`
- Test: `__tests__/lib/training-evaluator.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `__tests__/lib/training-evaluator.test.ts`:

```typescript
// __tests__/lib/training-evaluator.test.ts
import { parseReport, REPORT_SCHEMA, CRITERION_LABELS } from '@/lib/training/evaluator'

const good = {
  outcome: 'AGENDOU',
  redFlags: [],
  scores: {
    acolhimento: 9, qualificacao: 7, argumentos: 9,
    objecoes: 8.5, fechamento: 9, precisao: 8, risco: 10,
  },
  rationales: {
    acolhimento: 'Usou o nome da paciente várias vezes.',
    qualificacao: 'Perguntou o objetivo, não perguntou a origem do lead.',
    argumentos: 'Explicou a duração e o time multidisciplinar.',
    objecoes: 'Validou a experiência ruim anterior.',
    fechamento: 'Ofereceu quarta às 16h e criou o próximo passo.',
    precisao: 'Falou o preço correto conforme o cadastro.',
    risco: 'Não cruzou nenhuma linha vermelha.',
  },
  strengths: ['Paciência sem pressionar'],
  improvements: [{ quote: 'tenho certeza que voce vai adorar', problem: 'Assertivo demais para um paciente indeciso.' }],
  practicalTip: 'Valide primeiro: "Entendo perfeitamente sua cautela".',
  nextTraining: 'Nível 3, cenário G — qualificação foi o critério mais fraco.',
}

describe('training/evaluator — validação do JSON', () => {
  it('aceita um relatório completo', () => {
    expect(parseReport(good).outcome).toBe('AGENDOU')
  })

  it('rejeita desfecho fora da lista', () => {
    expect(() => parseReport({ ...good, outcome: 'TALVEZ' })).toThrow(/desfecho/i)
  })

  it('rejeita relatório sem algum dos 7 critérios', () => {
    const rest: Record<string, number> = { ...good.scores }
    delete rest.precisao
    expect(() => parseReport({ ...good, scores: rest })).toThrow(/precisao/i)
  })

  it('rejeita nota fora de 0 a 10', () => {
    expect(() => parseReport({ ...good, scores: { ...good.scores, risco: 11 } })).toThrow(/0 e 10/i)
    expect(() => parseReport({ ...good, scores: { ...good.scores, risco: -1 } })).toThrow(/0 e 10/i)
  })

  it('rejeita alerta vermelho sem a frase citada', () => {
    const bad = { ...good, redFlags: [{ quote: '', redLine: 'Promessa de resultado', why: 'grave' }] }
    expect(() => parseReport(bad)).toThrow(/frase/i)
  })

  it('aceita alerta vermelho completo', () => {
    const flagged = {
      ...good,
      redFlags: [{
        quote: 'quase 99% dos pacientes mantêm o peso',
        redLine: 'Citar estatística de sucesso inventada',
        why: 'Número não existe no cadastro e configura promessa de resultado.',
      }],
    }
    expect(parseReport(flagged).redFlags).toHaveLength(1)
  })

  it('rejeita item de melhoria sem citação literal', () => {
    const bad = { ...good, improvements: [{ quote: '', problem: 'texto longo' }] }
    expect(() => parseReport(bad)).toThrow(/cita/i)
  })

  it('rejeita entrada que não é objeto', () => {
    expect(() => parseReport(null)).toThrow()
    expect(() => parseReport('{}')).toThrow()
  })
})

describe('training/evaluator — schema e rótulos', () => {
  it('o schema exige os 7 critérios em scores', () => {
    const scores = REPORT_SCHEMA.properties.scores
    expect(scores.required).toHaveLength(7)
    expect(scores.additionalProperties).toBe(false)
  })

  it('há rótulo em português para cada um dos 7 critérios', () => {
    expect(Object.keys(CRITERION_LABELS)).toHaveLength(7)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest __tests__/lib/training-evaluator.test.ts`
Expected: FAIL — `Cannot find module '@/lib/training/evaluator'`

- [ ] **Step 3: Implementar**

Criar `src/lib/training/evaluator.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { formatKbForPrompt } from './kb'
import { LEVELS, SCENARIOS } from './personas'
import { isCreditError, OutOfCreditsError } from './patient'
import type {
  CriterionKey, Level, Outcome, Persona, ScenarioKey,
  TrainingKb, TrainingMessage, TrainingReport,
} from './types'

// Uma chamada por sessão. É o produto — vale o modelo forte.
const EVALUATOR_MODEL = 'claude-opus-5'

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  acolhimento: 'Acolhimento e clareza',
  qualificacao: 'Qualificação',
  argumentos: 'Argumentos e valor',
  objecoes: 'Objeções',
  fechamento: 'Fechamento',
  precisao: 'Precisão',
  risco: 'Risco',
}

const CRITERION_KEYS = Object.keys(CRITERION_LABELS) as CriterionKey[]
const OUTCOMES: Outcome[] = ['AGENDOU', 'NAO_AGENDOU', 'SUMIU', 'PERDEU_O_PACIENTE', 'DISPENSOU_BEM']

const scoreProp = { type: 'number', minimum: 0, maximum: 10 }
const stringProp = { type: 'string' }

export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'redFlags', 'scores', 'rationales', 'strengths', 'improvements', 'practicalTip', 'nextTraining'],
  properties: {
    outcome: { type: 'string', enum: OUTCOMES },
    redFlags: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['quote', 'redLine', 'why'],
        properties: { quote: stringProp, redLine: stringProp, why: stringProp },
      },
    },
    scores: {
      type: 'object', additionalProperties: false,
      required: CRITERION_KEYS,
      properties: Object.fromEntries(CRITERION_KEYS.map(k => [k, scoreProp])),
    },
    rationales: {
      type: 'object', additionalProperties: false,
      required: CRITERION_KEYS,
      properties: Object.fromEntries(CRITERION_KEYS.map(k => [k, stringProp])),
    },
    strengths: { type: 'array', items: stringProp },
    improvements: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['quote', 'problem'],
        properties: { quote: stringProp, problem: stringProp },
      },
    },
    practicalTip: stringProp,
    nextTraining: stringProp,
  },
} as const

function fail(msg: string): never { throw new Error(`Avaliação inválida: ${msg}`) }

export function parseReport(data: unknown): TrainingReport {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('não é um objeto')
  const r = data as Record<string, unknown>

  if (typeof r.outcome !== 'string' || !OUTCOMES.includes(r.outcome as Outcome)) {
    fail(`desfecho desconhecido: ${String(r.outcome)}`)
  }

  const scores = r.scores
  if (!scores || typeof scores !== 'object') fail('bloco scores ausente')
  for (const key of CRITERION_KEYS) {
    const value = (scores as Record<string, unknown>)[key]
    if (typeof value !== 'number' || Number.isNaN(value)) fail(`nota ausente para ${key}`)
    if (value < 0 || value > 10) fail(`nota de ${key} fora do intervalo entre 0 e 10`)
  }

  const rationales = r.rationales
  if (!rationales || typeof rationales !== 'object') fail('bloco rationales ausente')
  for (const key of CRITERION_KEYS) {
    if (typeof (rationales as Record<string, unknown>)[key] !== 'string') {
      fail(`justificativa ausente para ${key}`)
    }
  }

  if (!Array.isArray(r.redFlags)) fail('redFlags não é lista')
  for (const flag of r.redFlags as Record<string, unknown>[]) {
    if (typeof flag?.quote !== 'string' || !flag.quote.trim()) {
      fail('todo alerta vermelho precisa citar a frase exata da secretária')
    }
    if (typeof flag.redLine !== 'string' || typeof flag.why !== 'string') {
      fail('alerta vermelho incompleto')
    }
  }

  if (!Array.isArray(r.improvements)) fail('improvements não é lista')
  for (const item of r.improvements as Record<string, unknown>[]) {
    if (typeof item?.quote !== 'string' || !item.quote.trim()) {
      fail('todo ponto de melhoria precisa citar literalmente o que ela escreveu')
    }
    if (typeof item.problem !== 'string' || !item.problem.trim()) fail('ponto de melhoria sem explicação')
  }

  if (!Array.isArray(r.strengths)) fail('strengths não é lista')
  if (typeof r.practicalTip !== 'string' || !r.practicalTip.trim()) fail('dica prática ausente')
  if (typeof r.nextTraining !== 'string' || !r.nextTraining.trim()) fail('próximo treino ausente')

  return data as TrainingReport
}

export function buildEvaluatorPrompt(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
}): string {
  const { persona, level, scenario, kb } = params
  return `Você é um treinador de atendimento de clínicas médicas. Avalie a conversa abaixo, em que uma SECRETÁRIA atendeu um paciente simulado no WhatsApp.

# O TREINO
Paciente: ${persona.name}, ${persona.age} anos. ${persona.story}
Cenário: ${SCENARIOS[scenario]}
Nível ${level}: ${LEVELS[level]}

# GABARITO — a verdade sobre esta clínica
Tudo que a secretária afirmar diferente disto é ERRO DE PRECISÃO, mesmo que soe bem.

${formatKbForPrompt(kb)}

# COMO AVALIAR

Dê nota de 0 a 10 (uma casa decimal) em cada critério, com uma justificativa de uma linha:

1. acolhimento — tom, uso do nome, empatia. Também pesa AQUI: mensagem longa demais para WhatsApp e erro de digitação.
2. qualificacao — perguntou o nome, a origem do lead, o objetivo, o que deu errado antes.
3. argumentos — usou os diferenciais REAIS da clínica (a lista do gabarito) para justificar o preço.
4. objecoes — preço, comparação com concorrente, experiência ruim, desconfiança.
5. fechamento — ofereceu horário concreto e criou próximo passo com data.
6. precisao — preço, prazo, anos de experiência e protocolos conforme o GABARITO. Informação inventada derruba esta nota.
7. risco — 10 se ela não cruzou nenhuma linha vermelha; 0 se cruzou.

## Desfecho
Escolha um: AGENDOU, NAO_AGENDOU, SUMIU, PERDEU_O_PACIENTE, DISPENSOU_BEM.
- DISPENSOU_BEM só vale se ela SUSTENTOU a conversa e encerrou com firmeza e educação, sem julgar o paciente. Desistir na segunda objeção ou dizer coisas como "não é o seu momento" é PERDEU_O_PACIENTE.
- Quando o desfecho é DISPENSOU_BEM, avalie "fechamento" como "encerrou bem", não como "não agendou". Nesse caso não ofereceu horário NÃO é falha.

## Alertas vermelhos (redFlags)
Para CADA linha vermelha cruzada, registre a frase EXATA que ela escreveu, qual linha cruzou e por que é grave. Se não cruzou nenhuma, devolva lista vazia. Nunca invente um alerta.

## Pontos de melhoria (improvements)
Cada item precisa CITAR LITERALMENTE o que ela escreveu, e depois explicar o problema. Nunca escreva conselho genérico solto.

## Dica prática (practicalTip)
Uma frase PRONTA que ela possa copiar e usar na próxima vez, no contexto desta conversa.

## Próximo treino (nextTraining)
Sugira nível e cenário com base no critério MAIS FRACO — não suba de nível automaticamente.

Escreva tudo em português do Brasil, direto e sem rodeio. Seja justo: é treino, não punição.`
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function transcript(messages: TrainingMessage[]): string {
  return messages
    .map(m => `${m.role === 'paciente' ? 'PACIENTE' : 'SECRETÁRIA'}: ${m.content}`)
    .join('\n')
}

export async function evaluateSession(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
  messages: TrainingMessage[]
}): Promise<TrainingReport> {
  const system = buildEvaluatorPrompt(params)
  const user = `# A CONVERSA\n\n${transcript(params.messages)}`

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      // Streaming porque claude-opus-5 pensa por padrão, e max_tokens limita
      // thinking + texto juntos — sem stream a requisição pode estourar timeout.
      const message = await getClient().messages
        .stream({
          model: EVALUATOR_MODEL,
          max_tokens: 32000,
          system,
          output_config: {
            effort: 'high',
            format: { type: 'json_schema', schema: REPORT_SCHEMA as unknown as Record<string, unknown> },
          },
          messages: [{ role: 'user', content: user }],
        })
        .finalMessage()
      const block = message.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      raw = block?.text ?? ''
    } catch (err) {
      if (isCreditError(err)) throw new OutOfCreditsError()
      throw err
    }

    try {
      return parseReport(JSON.parse(raw))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Avaliação inválida')
}
```

> **Nota de tipagem:** se `output_config` ainda não estiver tipado na versão instalada do SDK, o `tsc` vai reclamar. Nesse caso, passe o objeto com `as unknown as Anthropic.MessageStreamParams` na chamada — não remova o parâmetro; ele é o que garante o JSON válido.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest __tests__/lib/training-evaluator.test.ts`
Expected: PASS — 10 testes

- [ ] **Step 5: Verificar tipagem**

Run: `npx tsc --noEmit`
Expected: sem erros. Se acusar `output_config`, aplique o cast da nota acima.

- [ ] **Step 6: Commit**

```bash
git add src/lib/training/evaluator.ts __tests__/lib/training-evaluator.test.ts && git commit -m "feat(treinamento): IA-avaliadora com saida estruturada e validacao do relatorio"
```

---

## Task 7: Rotas da base de conhecimento

**Files:**
- Create: `src/app/api/admin/treinamento/kb/route.ts`

- [ ] **Step 1: Criar a rota**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { readKb, writeKb, EMPTY_KB } from '@/lib/training/kb'

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 })
  }
  const kb = await readKb()
  return NextResponse.json({ kb: kb ?? EMPTY_KB, configured: kb !== null })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 })
  }
  const session = await auth()
  const userId = Number((session?.user as { id?: string })?.id)
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  try {
    const kb = await writeKb(body, userId)
    return NextResponse.json({ kb, configured: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Base de conhecimento inválida.' },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 2: Conferir o formato do id do usuário na sessão**

Run: `npx grep -rn "session?.user" src/app/api --include=*.ts | head -5`

Se o projeto expõe o id do usuário de staff com outro nome (ex.: `user_id`), ajuste a linha `const userId = ...` para o campo real antes de seguir. Não invente o campo — leia `src/auth.ts`.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/treinamento/kb/route.ts && git commit -m "feat(treinamento): rotas GET/PUT da base de conhecimento (admin)"
```

---

## Task 8: Rotas de sessão

**Files:**
- Create: `src/app/api/treinamento/sessions/route.ts`
- Create: `src/app/api/treinamento/sessions/[id]/route.ts`
- Create: `src/app/api/treinamento/sessions/[id]/messages/route.ts`
- Create: `src/app/api/treinamento/sessions/[id]/finish/route.ts`
- Create: `src/lib/training/guard.ts`

- [ ] **Step 1: Criar o helper de autorização**

Criar `src/lib/training/guard.ts`:

```typescript
import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { getSession } from './sessions'
import type { TrainingSession } from './types'

export async function currentUserId(): Promise<number | null> {
  const session = await auth()
  const id = Number((session?.user as { id?: string })?.id)
  return Number.isFinite(id) ? id : null
}

// Defesa contra IDOR: a sessão de treino é do dono, ou de qualquer admin.
export async function loadOwnedSession(
  sessionId: number
): Promise<{ session: TrainingSession; userId: number } | { error: string; status: number }> {
  const userId = await currentUserId()
  if (userId === null) return { error: 'Sessão inválida.', status: 401 }

  const session = await getSession(sessionId)
  if (!session) return { error: 'Treino não encontrado.', status: 404 }

  if (session.user_id !== userId && !(await isAdminSession())) {
    return { error: 'Treino não encontrado.', status: 404 }
  }
  return { session, userId }
}
```

- [ ] **Step 2: Criar POST/GET de sessões**

Criar `src/app/api/treinamento/sessions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/authz'
import { readKb } from '@/lib/training/kb'
import { pickPersona, SCENARIOS } from '@/lib/training/personas'
import { nextPatientTurn, OutOfCreditsError } from '@/lib/training/patient'
import { addMessages, createSession, listSessions } from '@/lib/training/sessions'
import { currentUserId } from '@/lib/training/guard'
import type { Level, ScenarioKey } from '@/lib/training/types'

export async function GET(req: NextRequest) {
  const userId = await currentUserId()
  if (userId === null) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const all = req.nextUrl.searchParams.get('all') === '1' && (await isAdminSession())
  const sessions = await listSessions(all ? {} : { userId })
  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId()
  if (userId === null) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const kb = await readKb()
  if (!kb) {
    return NextResponse.json(
      { error: 'A base de conhecimento ainda não foi preenchida. Sem ela o treino não sabe o que é certo.' },
      { status: 409 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as { level?: number; scenario?: string }
  const level = Number(body.level) as Level
  if (![1, 2, 3, 4, 5].includes(level)) {
    return NextResponse.json({ error: 'Escolha um nível de 1 a 5.' }, { status: 400 })
  }
  const scenario = String(body.scenario ?? '') as ScenarioKey
  if (!(scenario in SCENARIOS)) {
    return NextResponse.json({ error: 'Cenário inválido.' }, { status: 400 })
  }

  const persona = pickPersona(level, scenario)
  const session = await createSession({ userId, level, scenario, persona, kb })

  try {
    const { bubbles, outcome } = await nextPatientTurn({ persona, level, scenario, kb, history: [] })
    await addMessages(session.id, bubbles.map(content => ({ role: 'paciente' as const, content })))
    return NextResponse.json({ session, bubbles, outcome })
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      // A sessão já está criada e salva — ela pode retomar depois.
      return NextResponse.json({ session, error: err.message }, { status: 503 })
    }
    throw err
  }
}
```

- [ ] **Step 3: Criar GET da sessão**

Criar `src/app/api/treinamento/sessions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { loadOwnedSession } from '@/lib/training/guard'
import { listMessages } from '@/lib/training/sessions'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await loadOwnedSession(Number(id))
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const messages = await listMessages(result.session.id)
  return NextResponse.json({ session: result.session, messages })
}
```

- [ ] **Step 4: Criar POST de mensagem**

Criar `src/app/api/treinamento/sessions/[id]/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { loadOwnedSession } from '@/lib/training/guard'
import { nextPatientTurn, OutOfCreditsError } from '@/lib/training/patient'
import { addMessages, countSecretariaMessages, listMessages, markEnded } from '@/lib/training/sessions'

const MAX_SECRETARIA_MESSAGES = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await loadOwnedSession(Number(id))
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { session } = result

  if (session.status !== 'em_andamento') {
    return NextResponse.json({ error: 'Este treino já foi encerrado.' }, { status: 409 })
  }

  const body = (await req.json().catch(() => ({}))) as { content?: string }
  const content = String(body.content ?? '').trim()
  if (!content) return NextResponse.json({ error: 'Escreva uma resposta.' }, { status: 400 })

  await addMessages(session.id, [{ role: 'secretaria', content }])

  const sent = await countSecretariaMessages(session.id)
  if (sent >= MAX_SECRETARIA_MESSAGES) {
    await markEnded(session.id)
    return NextResponse.json({ bubbles: [], outcome: 'NAO_AGENDOU', ended: true, reason: 'limite' })
  }

  const history = await listMessages(session.id)
  try {
    const { bubbles, outcome } = await nextPatientTurn({
      persona: session.persona,
      level: session.level,
      scenario: session.scenario,
      kb: session.kb_snapshot,
      history,
    })
    await addMessages(session.id, bubbles.map(c => ({ role: 'paciente' as const, content: c })))
    if (outcome) await markEnded(session.id)
    return NextResponse.json({ bubbles, outcome, ended: outcome !== null })
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    throw err
  }
}
```

- [ ] **Step 5: Criar POST de encerramento**

Criar `src/app/api/treinamento/sessions/[id]/finish/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { loadOwnedSession } from '@/lib/training/guard'
import { evaluateSession } from '@/lib/training/evaluator'
import { OutOfCreditsError } from '@/lib/training/patient'
import { listMessages, markEnded, saveReport } from '@/lib/training/sessions'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await loadOwnedSession(Number(id))
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { session } = result

  if (session.status === 'avaliada') {
    return NextResponse.json({ session, report: session.report })
  }

  const messages = await listMessages(session.id)
  if (!messages.some(m => m.role === 'secretaria')) {
    return NextResponse.json(
      { error: 'Responda pelo menos uma vez antes de encerrar.' },
      { status: 400 }
    )
  }

  await markEnded(session.id)

  try {
    const report = await evaluateSession({
      persona: session.persona,
      level: session.level,
      scenario: session.scenario,
      kb: session.kb_snapshot,
      messages,
    })
    const updated = await saveReport(session.id, report)
    return NextResponse.json({ session: updated, report })
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Não foi possível gerar a avaliação. Tente de novo.' },
      { status: 502 }
    )
  }
}
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
git add src/lib/training/guard.ts src/app/api/treinamento && git commit -m "feat(treinamento): rotas de sessao — criar, responder, encerrar e avaliar"
```

---

## Task 9: Tela do admin — base de conhecimento

**Files:**
- Create: `src/app/admin/treinamento/page.tsx`

Antes de escrever, olhe uma tela existente (`src/app/estoque/page.tsx` ou `src/app/usuarios/page.tsx`) e siga as mesmas classes Tailwind, o mesmo layout de cabeçalho e o mesmo padrão de `'use client'` + `fetch`. Não invente um visual novo.

- [ ] **Step 1: Ler o padrão visual do projeto**

Run: `npx grep -ln "'use client'" src/app/usuarios/page.tsx src/app/estoque/page.tsx`

Leia o arquivo que existir e reaproveite a estrutura (cabeçalho, botão primário, campo de texto, mensagem de erro).

- [ ] **Step 2: Criar a tela**

`src/app/admin/treinamento/page.tsx` — componente cliente com:

- `useEffect` que faz `GET /api/admin/treinamento/kb` e preenche o estado
- Um `<form>` com seções: Médicos (lista editável), Consulta (valor em reais, duração, itens inclusos, semanas até o retorno), **Planos de acompanhamento** (nome, meses, valor), Pagamento, Convênio, Procedimentos, Canetas, No-show, Links, Linhas vermelhas, Respostas-modelo
- Listas (inclusos, linhas vermelhas, respostas-modelo, planos, procedimentos, médicos) editadas com botões "+ adicionar" e "remover" por item
- Todo valor digitado em reais e convertido para centavos no envio: `Math.round(parseFloat(valor.replace(',', '.')) * 100)`
- Botão "Salvar" que faz `PUT /api/admin/treinamento/kb` com o JSON da base
- Se a resposta for 400, mostrar `error` da API em destaque vermelho acima do formulário — as mensagens já vêm prontas em português de `validateKb`
- Se for 403, mostrar "Acesso restrito ao administrador."

- [ ] **Step 3: Rodar o build**

Run: `npm run build`
Expected: build passa sem erro de tipo ou de lint

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/treinamento && git commit -m "feat(treinamento): tela de cadastro da base de conhecimento"
```

---

## Task 10: Telas do treino

**Files:**
- Create: `src/app/treinamento/page.tsx`
- Create: `src/app/treinamento/[id]/page.tsx`

- [ ] **Step 1: Criar a tela de início**

`src/app/treinamento/page.tsx` — componente cliente com:

- Seleção de **nível** (5 cartões, 1 a 5, com o texto de `LEVELS`) e **cenário** (10 opções, com o texto de `SCENARIOS`)
- Botão "Deixa a IA escolher" que sorteia nível e cenário no cliente
- Botão "Começar treino" → `POST /api/treinamento/sessions` → redireciona para `/treinamento/{id}`
- Se a resposta for 409, mostrar a mensagem da API com um link para `/admin/treinamento`
- Abaixo, histórico pessoal: `GET /api/treinamento/sessions`, listando data, nível, cenário, desfecho, média e status, cada linha linkando para a sessão
- Sessões com `status = 'em_andamento'` aparecem com etiqueta "em andamento" e link para retomar

`LEVELS` e `SCENARIOS` vêm de `@/lib/training/personas` — importe, não duplique os textos.

- [ ] **Step 2: Criar a tela do chat**

`src/app/treinamento/[id]/page.tsx` — componente cliente com:

- `GET /api/treinamento/sessions/{id}` no carregamento, montando a lista de mensagens
- Visual de WhatsApp: balões do paciente à esquerda, da secretária à direita
- Campo de texto + botão enviar → `POST .../messages`
- Enquanto espera a resposta, mostrar indicador "digitando…" e só então renderizar os balões, um a cada ~600 ms, para dar o ritmo real
- Botão "Encerrar e avaliar" no topo → `POST .../finish`
- Quando a resposta de `/messages` vier com `ended: true`, desabilitar o campo e destacar o botão de avaliar
- Erro 503 (créditos): mostrar a mensagem da API num aviso e deixar claro que a conversa está salva
- Quando houver relatório, renderizar abaixo do chat, nesta ordem:
  1. 🚨 Alertas vermelhos — frase citada, linha cruzada, por quê (fundo vermelho)
  2. Desfecho
  3. As 7 notas com a justificativa de cada uma (rótulos vindos de `CRITERION_LABELS`)
  4. Média e status
  5. Pontos fortes
  6. A melhorar — a citação em itálico, o problema abaixo
  7. Dica prática
  8. Próximo treino sugerido

A média e o status vêm da sessão retornada pela API (`average`, `verdict`) — não recalcule no cliente.

- [ ] **Step 3: Rodar o build e a suíte completa**

Run: `npm run build && npx jest`
Expected: build OK; todos os testes passando

- [ ] **Step 4: Commit**

```bash
git add src/app/treinamento && git commit -m "feat(treinamento): sala de treino e chat estilo WhatsApp com relatorio de avaliacao"
```

---

## Verificação final

- [ ] `npx jest __tests__/lib/training-*.test.ts` — 41 testes novos, todos passando
- [ ] `npx jest` — as 4 suítes que **já estavam quebradas antes deste módulo** continuam sendo as únicas vermelhas: `task-definitions` (espera 18 tarefas, o código mudou), `task-completions` e `patients` (arquivos vazios), `PatientCard` (tipo `created_by` desatualizado). Nenhuma delas é escopo deste trabalho.
- [ ] `npx tsc --noEmit` — sem erros
- [ ] `npm run build` — build de produção passa
- [ ] Com `ANTHROPIC_API_KEY` configurada: preencher a base em `/admin/treinamento`, abrir `/treinamento`, rodar um treino nível 3 cenário A até o fim e conferir que o relatório aparece com as 7 notas
- [ ] Rodar um treino em que a resposta contenha uma promessa de resultado ("você vai perder 10kg em 2 meses") e confirmar que o alerta vermelho aparece no topo e o status é `REPROVADA`
