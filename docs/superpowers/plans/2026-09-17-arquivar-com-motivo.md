# Arquivar com motivo + mensagem recolhida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir mover um paciente para Pacientes Antigos com um motivo obrigatório (pela aba Em tratamento e pelo botão 📦 do card), guardar histórico, reativar sozinho quem volta a aplicar, e recolher a mensagem longa nos cards da aba Em tratamento.

**Architecture:** Regras puras (implante, mensagem longa, motivo, id) em módulos sem banco. Um módulo de servidor arquiva e reativa gravando eventos numa tabela nova. As rotas de arquivar/reativar passam a exigir sessão, validar e auditar. `createMovement` reativa na mesma transação da saída. Três componentes mudam na tela.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Postgres (postgres.js), Jest + ts-jest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-17-arquivar-com-motivo-design.md](../specs/2026-09-17-arquivar-com-motivo-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/em-tratamento.ts` | + `ehSaidaDeImplante`, `mensagemLonga`, `LINHAS_RESUMO`. |
| `src/lib/arquivo-paciente.ts` | **Novo.** `validarMotivo`, `idPacienteValido`, `MOTIVO_MIN`, `MOTIVO_MAX`. Puro. |
| `src/lib/db.ts` | Cria `patient_archive_events`. |
| `src/lib/patient-archive.ts` | **Novo.** `arquivarPaciente`, `reativarPaciente`. Só servidor. |
| `src/lib/patients.ts` | `listArchivedPatients` traz o último motivo; tipo `ArchivedPatientItem`; remove `archivePatient`/`unarchivePatient`. |
| `src/app/api/patients/[id]/archive/route.ts` | Exige sessão e motivo; audita. |
| `src/app/api/patients/[id]/unarchive/route.ts` | Exige sessão; grava evento; audita. |
| `src/lib/stock.ts` | `createMovement` reativa paciente arquivado. |
| `src/app/relatorios/EmTratamento.tsx` | Mensagem recolhida; arquivar nos cards 🟡/🔴. |
| `src/components/ArchivePatientButton.tsx` | Janela com Observações. |
| `src/components/ArchivedPatientsList.tsx` | Mostra o motivo. |
| Testes | `__tests__/lib/arquivo-paciente.test.ts` (novo), `__tests__/lib/em-tratamento.test.ts`, `__tests__/components/EmTratamento.test.tsx`, `__tests__/components/ArchivePatientButton.test.tsx` (novo), `__tests__/components/ArchivedPatientsList.test.tsx` (novo). |

## Contexto que o executor precisa saber

- **O banco do `.env.local` é o de PRODUÇÃO.** Não rode o servidor de desenvolvimento, não chame as rotas e não execute nada que grave no banco.
- **`npm run build` roda as migrações no banco de produção.** A página `/admin/auditoria` é pré-renderizada e chama `initSchema()`. Isso é conhecido e aceito: as migrações são idempotentes e só acrescentam coisas. Por isso, a tabela nova deste plano passa a existir em produção no primeiro build. Rode o build só onde o plano pede.
- Scripts `.mts` de conferência rodam com `node --env-file=.env.local x.mts`. Eles não conseguem importar `src/lib/db.ts` nem `src/lib/stock.ts`.
- **Suítes que já falhavam:** `npx jest` tem 4 suítes vermelhas antes deste trabalho (`task-definitions`, `task-completions`, `patients`, `PatientCard`). `npx tsc --noEmit` já tem erros em `__tests__/components/PatientCard.test.tsx`. Ignore esses, só não aumente a lista.
- **ESLint:** não está configurado. Não rode.
- **Import do banco:** o padrão é `import sql, { initSchema } from './db'` (ou `'@/lib/db'`). `logAudit` vem de `./audit`, recebe `{ userName, action, entityType, entityId?, patientId?, details? }` e nunca lança erro.
- **Sessão da equipe:** `import { auth } from '@/auth'`. `session?.user` indica que há sessão, e `session.user.name` é o nome de quem está logado.
- **Paciente arquivado:** `patients.archived_at IS NOT NULL`. Paciente excluído: `patients.deleted_at IS NOT NULL`.
- **Testes de componente:** mocke `next/navigation` com `jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))`. A variável precisa começar com `mock` por causa do hoisting do `jest.mock`.

---

## Task 1: Regras puras

**Files:**
- Modify: `src/lib/em-tratamento.ts`
- Create: `src/lib/arquivo-paciente.ts`
- Test: `__tests__/lib/em-tratamento.test.ts`, `__tests__/lib/arquivo-paciente.test.ts`

- [ ] **Step 1: Testes que falham**

Em `__tests__/lib/em-tratamento.test.ts`, trocar o bloco de import do topo por:

```typescript
import {
  ETIQUETAS, MENSAGENS,
  dataBrasilia, diasEntre, inicioDaSemanaBrasilia,
  classificar, primeiroNome, mensagemPara, listarSubAba,
  ehSaidaDeImplante, mensagemLonga,
  type PacienteEmTratamento,
} from '@/lib/em-tratamento'
```

e acrescentar no **fim** do arquivo:

```typescript
describe('ehSaidaDeImplante', () => {
  // Espelha o SQL de listarEmTratamento:
  //   COALESCE(m.observation, '') <> 'Implante hormonal' AND i.name NOT ILIKE '%implante%'
  it('reconhece implante pelo nome do item, em qualquer caixa', () => {
    expect(ehSaidaDeImplante('IMPLANTE - NADH 300 MG', null)).toBe(true)
    expect(ehSaidaDeImplante('Implante Testosterona 100 mg', '')).toBe(true)
  })

  it('reconhece implante pela observação exata da tela de Implantes', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', 'Implante hormonal')).toBe(true)
  })

  it('observação diferente da exata não conta (o SQL compara exato)', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', 'implante hormonal')).toBe(false)
  })

  it('o resto não é implante', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', 'Tirzepartida 5mg')).toBe(false)
    expect(ehSaidaDeImplante('Curcumina', null)).toBe(false)
    expect(ehSaidaDeImplante(null, null)).toBe(false)
    expect(ehSaidaDeImplante(undefined, undefined)).toBe(false)
  })
})

describe('mensagemLonga', () => {
  it('as três mensagens atuais são longas', () => {
    for (const e of ETIQUETAS) expect(mensagemLonga(mensagemPara(e, 'Ana'))).toBe(true)
  })

  it('até 3 linhas e 180 caracteres é curta', () => {
    expect(mensagemLonga('Oi, Ana!')).toBe(false)
    expect(mensagemLonga('a\nb\nc')).toBe(false)
    expect(mensagemLonga('x'.repeat(180))).toBe(false)
  })

  it('mais de 3 linhas ou mais de 180 caracteres é longa', () => {
    expect(mensagemLonga('a\nb\nc\nd')).toBe(true)
    expect(mensagemLonga('x'.repeat(181))).toBe(true)
  })
})
```

Criar `__tests__/lib/arquivo-paciente.test.ts`:

```typescript
// __tests__/lib/arquivo-paciente.test.ts
import { validarMotivo, idPacienteValido, MOTIVO_MIN, MOTIVO_MAX } from '@/lib/arquivo-paciente'

describe('validarMotivo', () => {
  it('limpa os espaços das pontas', () => {
    expect(validarMotivo('  Parou por custo  ')).toBe('Parou por custo')
  })

  it('exige de 3 a 500 caracteres depois de limpar', () => {
    expect(MOTIVO_MIN).toBe(3)
    expect(MOTIVO_MAX).toBe(500)
    expect(validarMotivo('ab')).toBeNull()
    expect(validarMotivo('   ab   ')).toBeNull()
    expect(validarMotivo(' abc ')).toBe('abc')
    expect(validarMotivo('x'.repeat(500))).toBe('x'.repeat(500))
    expect(validarMotivo('x'.repeat(501))).toBeNull()
  })

  it('recusa o que não é texto', () => {
    expect(validarMotivo(123)).toBeNull()
    expect(validarMotivo(null)).toBeNull()
    expect(validarMotivo(undefined)).toBeNull()
    expect(validarMotivo({})).toBeNull()
  })
})

describe('idPacienteValido', () => {
  it('aceita inteiro positivo em número ou texto', () => {
    expect(idPacienteValido(135)).toBe(135)
    expect(idPacienteValido('135')).toBe(135)
    expect(idPacienteValido('2147483647')).toBe(2147483647)
  })

  it('recusa zero, negativo, fração, texto e vazio', () => {
    for (const v of ['0', '-1', '1.5', 'abc', '', ' ', 0, -3, 2.5]) {
      expect(idPacienteValido(v)).toBeNull()
    }
  })

  it('recusa acima do INTEGER do Postgres e tipos estranhos', () => {
    expect(idPacienteValido(2147483648)).toBeNull()
    expect(idPacienteValido(true)).toBeNull()
    expect(idPacienteValido(null)).toBeNull()
    expect(idPacienteValido(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/lib/em-tratamento.test.ts __tests__/lib/arquivo-paciente.test.ts`
Expected: FAIL (funções inexistentes / módulo não encontrado).

- [ ] **Step 3: Implementar**

Em `src/lib/em-tratamento.ts`, acrescentar no **fim** do arquivo:

```typescript

/**
 * Implante é semestral e tem módulo próprio: não conta como aplicação do
 * tratamento semanal. Espelha o filtro SQL de listarEmTratamento.
 */
export function ehSaidaDeImplante(
  nomeItem: string | null | undefined,
  observacao: string | null | undefined,
): boolean {
  return (observacao ?? '') === 'Implante hormonal' || /implante/i.test(nomeItem ?? '')
}

export const LINHAS_RESUMO = 3
const CARACTERES_RESUMO = 180

/** Mensagem longa aparece recolhida no card, com botão para abrir. */
export function mensagemLonga(texto: string): boolean {
  return texto.split('\n').length > LINHAS_RESUMO || texto.length > CARACTERES_RESUMO
}
```

Criar `src/lib/arquivo-paciente.ts`:

```typescript
// Regras de arquivamento de paciente. Puro — usado pela API e pelos
// formulários, para que a tela e o servidor recusem exatamente o mesmo.

export const MOTIVO_MIN = 3
export const MOTIVO_MAX = 500
const MAIOR_INTEIRO_PG = 2147483647

/** Motivo limpo, ou `null` se vazio, curto ou longo demais. */
export function validarMotivo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return texto.length >= MOTIVO_MIN && texto.length <= MOTIVO_MAX ? texto : null
}

/** Id de paciente vindo de URL ou JSON; `null` se não couber num INTEGER positivo. */
export function idPacienteValido(valor: unknown): number | null {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null
  if (typeof valor === 'string' && valor.trim() === '') return null
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 && n <= MAIOR_INTEIRO_PG ? n : null
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest __tests__/lib/em-tratamento.test.ts __tests__/lib/arquivo-paciente.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/em-tratamento.ts src/lib/arquivo-paciente.ts __tests__/lib/em-tratamento.test.ts __tests__/lib/arquivo-paciente.test.ts && git commit -m "feat(arquivo): regras puras de motivo, id, implante e mensagem longa"
```

---

## Task 2: Tabela, módulo de arquivamento e lista com motivo

**Files:**
- Modify: `src/lib/db.ts` (fim de `runMigrations()`)
- Create: `src/lib/patient-archive.ts`
- Modify: `src/lib/patients.ts`

Sem harness de banco: a verificação é por tipos.

- [ ] **Step 1: Migração**

Em `src/lib/db.ts`, no **fim** de `runMigrations()`, depois do bloco `treatment_messages` e antes da `}` que fecha a função:

```typescript

  // Histórico de arquivamento/reativação de pacientes, com o motivo de quem
  // parou o tratamento. Um registro por evento, para o motivo antigo não se
  // perder quando o paciente vai e volta.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patient_archive_events (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('arquivado', 'reativado')),
      reason TEXT,
      source TEXT NOT NULL CHECK (source IN ('em_tratamento', 'card_paciente', 'pacientes_antigos', 'nova_aplicacao')),
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS patient_archive_events_patient_idx
      ON patient_archive_events (patient_id, created_at DESC);
  `).catch(() => {})
```

- [ ] **Step 2: Módulo de arquivamento**

Criar `src/lib/patient-archive.ts`:

```typescript
import sql, { initSchema } from './db'

export type OrigemArquivamento = 'em_tratamento' | 'card_paciente'
export type OrigemReativacao = 'pacientes_antigos'

/**
 * Arquiva e registra o motivo numa transação. `false` quando não há o que
 * arquivar: paciente inexistente, excluído ou já arquivado.
 */
export async function arquivarPaciente(
  id: number,
  motivo: string,
  por: string,
  origem: OrigemArquivamento,
): Promise<boolean> {
  await initSchema()
  return sql.begin(async (tx) => {
    const [paciente] = await tx<{ id: number }[]>`
      UPDATE patients SET archived_at = NOW()
      WHERE id = ${id} AND archived_at IS NULL AND deleted_at IS NULL
      RETURNING id
    `
    if (!paciente) return false
    await tx`
      INSERT INTO patient_archive_events (patient_id, action, reason, source, created_by)
      VALUES (${id}, 'arquivado', ${motivo}, ${origem}, ${por})
    `
    return true
  })
}

/**
 * Reativa pela tela de Pacientes Antigos. `false` quando o paciente não está
 * arquivado (ou não existe). A reativação automática por nova aplicação fica
 * em createMovement, dentro da transação da saída.
 */
export async function reativarPaciente(
  id: number,
  por: string,
  origem: OrigemReativacao,
): Promise<boolean> {
  await initSchema()
  return sql.begin(async (tx) => {
    const [paciente] = await tx<{ id: number }[]>`
      UPDATE patients SET archived_at = NULL
      WHERE id = ${id} AND archived_at IS NOT NULL AND deleted_at IS NULL
      RETURNING id
    `
    if (!paciente) return false
    await tx`
      INSERT INTO patient_archive_events (patient_id, action, source, created_by)
      VALUES (${id}, 'reativado', ${origem}, ${por})
    `
    return true
  })
}
```

- [ ] **Step 3: Lista de arquivados com o último motivo**

Em `src/lib/patients.ts`, logo depois da interface `PatientListItem`:

```typescript

export interface ArchivedPatientItem extends PatientListItem {
  archive_reason: string | null
  archived_by: string | null
  archive_event_at: string | null
}
```

E trocar a função `listArchivedPatients` inteira por:

```typescript
export async function listArchivedPatients(): Promise<ArchivedPatientItem[]> {
  await initSchema()
  // O motivo vem do último arquivamento registrado. Quem foi arquivado antes
  // do histórico existir fica com os três campos nulos.
  const rows = await sql<ArchivedPatientItem[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count,
           ev.reason AS archive_reason,
           ev.created_by AS archived_by,
           ev.created_at AS archive_event_at
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    LEFT JOIN LATERAL (
      SELECT e.reason, e.created_by, e.created_at
      FROM patient_archive_events e
      WHERE e.patient_id = p.id AND e.action = 'arquivado'
      ORDER BY e.created_at DESC
      LIMIT 1
    ) ev ON true
    WHERE p.deleted_at IS NULL AND p.archived_at IS NOT NULL
    GROUP BY p.id, ev.reason, ev.created_by, ev.created_at
    ORDER BY p.archived_at DESC
  `
  return rows
}
```

- [ ] **Step 4: Tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/patient-archive.ts src/lib/patients.ts && git commit -m "feat(arquivo): historico de arquivamento e motivo na lista de antigos"
```

---

## Task 3: Rotas de arquivar e reativar

**Files:**
- Modify: `src/app/api/patients/[id]/archive/route.ts`
- Modify: `src/app/api/patients/[id]/unarchive/route.ts`
- Modify: `src/lib/patients.ts` (remover funções que deixam de ser usadas)

- [ ] **Step 1: Arquivar**

Substituir **todo** o conteúdo de `src/app/api/patients/[id]/archive/route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { idPacienteValido, validarMotivo, MOTIVO_MIN, MOTIVO_MAX } from '@/lib/arquivo-paciente'
import { arquivarPaciente, type OrigemArquivamento } from '@/lib/patient-archive'

export const dynamic = 'force-dynamic'

const ORIGENS: readonly OrigemArquivamento[] = ['em_tratamento', 'card_paciente']

function ehOrigem(valor: unknown): valor is OrigemArquivamento {
  return typeof valor === 'string' && (ORIGENS as readonly string[]).includes(valor)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const patientId = idPacienteValido(id)
  if (!patientId) return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const motivo = validarMotivo(body?.motivo)
  if (!motivo) {
    return NextResponse.json(
      { error: `Escreva o motivo (de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres).` },
      { status: 400 }
    )
  }
  if (!ehOrigem(body?.origem)) {
    return NextResponse.json({ error: 'origem inválida' }, { status: 400 })
  }

  const userName = session.user.name ?? 'desconhecido'
  const arquivado = await arquivarPaciente(patientId, motivo, userName, body.origem)
  if (!arquivado) {
    return NextResponse.json({ error: 'Paciente não encontrado ou já arquivado' }, { status: 404 })
  }

  await logAudit({
    userName,
    action: 'paciente_arquivado',
    entityType: 'patient',
    entityId: patientId,
    patientId,
    details: motivo,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Reativar**

Substituir **todo** o conteúdo de `src/app/api/patients/[id]/unarchive/route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { idPacienteValido } from '@/lib/arquivo-paciente'
import { reativarPaciente } from '@/lib/patient-archive'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const patientId = idPacienteValido(id)
  if (!patientId) return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 })

  const userName = session.user.name ?? 'desconhecido'
  const reativado = await reativarPaciente(patientId, userName, 'pacientes_antigos')
  if (!reativado) {
    return NextResponse.json({ error: 'Paciente não encontrado ou não está arquivado' }, { status: 404 })
  }

  await logAudit({
    userName,
    action: 'paciente_reativado',
    entityType: 'patient',
    entityId: patientId,
    patientId,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Remover as funções antigas**

Confirme que nada mais usa as funções antigas:

Run: `grep -rn "archivePatient\|unarchivePatient" src __tests__`
Expected: só as duas definições em `src/lib/patients.ts`.

Remova de `src/lib/patients.ts` as funções `archivePatient` e `unarchivePatient` inteiras. Se o grep mostrar outro uso, **não remova**: reporte.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npm run build 2>&1 | grep -E "Compiled|Failed|Type error"` → `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/patients/[id]/archive/route.ts" "src/app/api/patients/[id]/unarchive/route.ts" src/lib/patients.ts && git commit -m "feat(arquivo): arquivar exige motivo e sessao; reativar registra historico"
```

---

## Task 4: Reativação automática por nova aplicação

**Files:**
- Modify: `src/lib/stock.ts` (`createMovement`)

- [ ] **Step 1: Imports**

No topo de `src/lib/stock.ts`, logo depois de `import sql, { initSchema } from './db'`:

```typescript
import { logAudit } from './audit'
import { ehSaidaDeImplante } from './em-tratamento'
```

- [ ] **Step 2: Reativar dentro da transação**

Em `createMovement`, trocar

```typescript
  const row = await sql.begin(async (tx) => {
```

por

```typescript
  const { inserted: row, reativado } = await sql.begin(async (tx) => {
```

E trocar o final da transação e da função. O trecho atual é:

```typescript
      RETURNING *
    `
    return inserted
  })

  return normalizeMovement(row as StockMovement)
}
```

O novo é:

```typescript
      RETURNING *
    `

    // Paciente que tinha parado e voltou a aplicar sai de Pacientes Antigos
    // sozinho. Implante não conta: é semestral e não significa retomar o
    // tratamento (mesma regra da aba Em tratamento). Fica na mesma transação
    // para a saída e a reativação acontecerem juntas.
    let reativado = false
    if (data.type === 'saida' && data.patient_id) {
      const [item] = await tx<{ name: string }[]>`
        SELECT name FROM stock_items WHERE id = ${itemId}
      `
      if (!ehSaidaDeImplante(item?.name, data.observation)) {
        const [paciente] = await tx<{ id: number }[]>`
          UPDATE patients SET archived_at = NULL
          WHERE id = ${data.patient_id} AND archived_at IS NOT NULL AND deleted_at IS NULL
          RETURNING id
        `
        if (paciente) {
          await tx`
            INSERT INTO patient_archive_events (patient_id, action, source, created_by)
            VALUES (${data.patient_id}, 'reativado', 'nova_aplicacao', ${data.created_by ?? null})
          `
          reativado = true
        }
      }
    }

    return { inserted, reativado }
  })

  if (reativado && data.patient_id) {
    await logAudit({
      userName: data.created_by ?? 'sistema',
      action: 'paciente_reativado_automaticamente',
      entityType: 'patient',
      entityId: data.patient_id,
      patientId: data.patient_id,
      details: `nova aplicação (saída ${(row as StockMovement).id})`,
    })
  }

  return normalizeMovement(row as StockMovement)
}
```

O caminho de idempotência, que devolve um movimento já existente antes da transação, fica como está. Ele não gravou nada novo, então não reativa ninguém.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.
Run: `npx jest 2>&1 | grep -E "^(FAIL|Tests:)"` → só as 4 suítes pré-existentes.

Confira à mão, lendo o código:
- a reativação usa `itemId`, que pode ter sido trocado pela regra de lote, e não `data.item_id`;
- entrada nunca reativa;
- saída sem `patient_id` nunca reativa.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stock.ts && git commit -m "feat(arquivo): nova aplicacao reativa paciente arquivado"
```

---

## Task 5: Aba Em tratamento — mensagem recolhida e arquivar

**Files:**
- Modify: `src/app/relatorios/EmTratamento.tsx`
- Test: `__tests__/components/EmTratamento.test.tsx`

- [ ] **Step 1: Testes que falham**

Em `__tests__/components/EmTratamento.test.tsx`, trocar o `fetchMock` do `beforeEach` por uma versão que também atende a rota de arquivar:

```typescript
beforeEach(() => {
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/archive')) return { ok: true, status: 200, json: async () => ({ ok: true }) }
    if (init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ template: 'amarela', sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' }) }
    }
    if (init?.method === 'DELETE') return { ok: true, status: 204, json: async () => null }
    return { ok: true, status: 200, json: async () => LISTA }
  })
  global.fetch = fetchMock as unknown as typeof fetch
})
```

E acrescentar, dentro do `describe('EmTratamento', ...)`, antes do `})` final:

```typescript
  it('a mensagem longa começa recolhida e abre pela seta', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const bruno = cards()[2]
    const mensagem = within(bruno).getByText(/Vamos ao seu acompanhamento semanal/)
    expect(mensagem).toHaveClass('line-clamp-3')

    const seta = within(bruno).getByRole('button', { name: /Ver mensagem completa/ })
    expect(seta).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(seta)

    expect(mensagem).not.toHaveClass('line-clamp-3')
    const recolher = within(bruno).getByRole('button', { name: /Recolher/ })
    expect(recolher).toHaveAttribute('aria-expanded', 'true')
    // Abrir um card não abre os outros.
    expect(within(cards()[0]).getByRole('button', { name: /Ver mensagem completa/ })).toBeInTheDocument()
  })

  it('copiar leva o texto inteiro mesmo com a mensagem recolhida', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[2]).getByRole('button', { name: /Copiar mensagem/ }))
    expect(writeText.mock.calls[0][0]).toContain('4 = Todos os dias')
  })

  it('só os cards 🟡 e 🔴 têm o botão de mover para Pacientes Antigos', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const [ana, carla, bruno] = cards()
    expect(within(ana).getByRole('button', { name: /Mover para Pacientes Antigos/ })).toBeInTheDocument()
    expect(within(carla).getByRole('button', { name: /Mover para Pacientes Antigos/ })).toBeInTheDocument()
    expect(within(bruno).queryByRole('button', { name: /Mover para Pacientes Antigos/ })).not.toBeInTheDocument()
  })

  it('Confirmar só libera com um motivo de pelo menos 3 caracteres', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    const confirmar = within(cards()[0]).getByRole('button', { name: 'Confirmar' })
    expect(confirmar).toBeDisabled()
    const campo = within(cards()[0]).getByLabelText(/Observações/)
    await userEvent.type(campo, '  a ')
    expect(confirmar).toBeDisabled()
    await userEvent.type(campo, 'bc')
    expect(confirmar).toBeEnabled()
  })

  it('arquivar tira o card da lista e atualiza as contagens', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    await userEvent.type(within(cards()[0]).getByLabelText(/Observações/), '  Parou por custo ')
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(nomes()).toEqual(['Carla Dias', 'BRUNO LIMA'])
    expect(screen.getByRole('button', { name: 'Todos (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não veio (1)' })).toBeInTheDocument()

    const chamada = fetchMock.mock.calls.find(c => String(c[0]).includes('/archive'))
    expect(chamada[0]).toBe('/api/patients/3/archive')
    expect(chamada[1].method).toBe('POST')
    expect(JSON.parse(String(chamada[1].body))).toEqual({ motivo: 'Parou por custo', origem: 'em_tratamento' })
  })

  it('se arquivar falha, o card fica e o aviso aparece nele', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/archive')
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => LISTA })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    await userEvent.type(within(cards()[0]).getByLabelText(/Observações/), 'Parou por custo')
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Confirmar' }))

    expect(await within(cards()[0]).findByRole('alert')).toHaveTextContent('Não foi possível mover para Pacientes Antigos')
    expect(cards()).toHaveLength(3)
  })

  it('Cancelar fecha o formulário sem chamar o servidor', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Cancelar' }))
    expect(within(cards()[0]).queryByLabelText(/Observações/)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/archive'))).toBe(false)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/components/EmTratamento.test.tsx`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

Em `src/app/relatorios/EmTratamento.tsx`:

**3a.** Trocar o import de `@/lib/em-tratamento` por:

```typescript
import {
  listarSubAba, mensagemPara, mensagemLonga, DIAS_VERDE, DIAS_AMARELA,
  type Etiqueta, type PacienteEmTratamento, type SubAba,
} from '@/lib/em-tratamento'
import { validarMotivo, MOTIVO_MAX } from '@/lib/arquivo-paciente'
```

**3b.** Logo depois da linha `const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null)`:

```typescript
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set())
  const [arquivando, setArquivando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvandoArquivo, setSalvandoArquivo] = useState(false)
```

**3c.** Logo antes de `if (!lista) {`:

```typescript
  function alternarMensagem(id: number) {
    setAbertas(atual => {
      const nova = new Set(atual)
      if (nova.has(id)) nova.delete(id)
      else nova.add(id)
      return nova
    })
  }

  function abrirArquivamento(id: number) {
    setAviso(null)
    setMotivo('')
    setArquivando(id)
  }

  function cancelarArquivamento() {
    setArquivando(null)
    setMotivo('')
  }

  async function arquivar(p: PacienteEmTratamento) {
    const texto = validarMotivo(motivo)
    if (!texto) return
    setSalvandoArquivo(true)
    setAviso(null)
    try {
      const res = await fetch(`/api/patients/${p.patientId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: texto, origem: 'em_tratamento' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setLista(atual => atual && atual.filter(x => x.patientId !== p.patientId))
      setArquivando(null)
      setMotivo('')
    } catch {
      setAviso({ id: p.patientId, texto: 'Não foi possível mover para Pacientes Antigos. Tente de novo.' })
    } finally {
      setSalvandoArquivo(false)
    }
  }
```

**3d.** Trocar o parágrafo da mensagem:

```tsx
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 select-text whitespace-pre-line">
                {mensagemPara(p.etiqueta, p.nome)}
              </p>
```

por:

```tsx
              {(() => {
                const texto = mensagemPara(p.etiqueta, p.nome)
                const longa = mensagemLonga(texto)
                const aberta = abertas.has(p.patientId)
                return (
                  <div>
                    <p
                      id={`mensagem-${p.patientId}`}
                      className={`text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 select-text whitespace-pre-line ${
                        longa && !aberta ? 'line-clamp-3' : ''
                      }`}
                    >
                      {texto}
                    </p>
                    {longa && (
                      <button
                        type="button"
                        onClick={() => alternarMensagem(p.patientId)}
                        aria-expanded={aberta}
                        aria-controls={`mensagem-${p.patientId}`}
                        className="mt-1 text-xs font-medium text-violet-700 hover:text-violet-900"
                      >
                        {aberta ? '▲ Recolher' : '▼ Ver mensagem completa'}
                      </button>
                    )}
                  </div>
                )
              })()}
```

**3e.** Na fileira de botões, logo depois do `</button>` do "Marcar como enviada / Desfazer" e **antes** do `{p.enviada && (`, acrescentar:

```tsx
                {p.etiqueta !== 'verde' && arquivando !== p.patientId && (
                  <button
                    type="button"
                    onClick={() => abrirArquivamento(p.patientId)}
                    disabled={salvandoArquivo}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <span aria-hidden="true">📦</span> Mover para Pacientes Antigos
                  </button>
                )}
```

**3f.** Logo depois do `</div>` que fecha a fileira de botões e **antes** do `{aviso?.id === p.patientId && (`, acrescentar:

```tsx
              {arquivando === p.patientId && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                  <label htmlFor={`motivo-${p.patientId}`} className="block text-xs font-medium text-amber-900">
                    Observações — por que o paciente parou?
                  </label>
                  <textarea
                    id={`motivo-${p.patientId}`}
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    rows={3}
                    maxLength={MOTIVO_MAX}
                    autoFocus
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={cancelarArquivamento}
                      disabled={salvandoArquivo}
                      className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-white disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => arquivar(p)}
                      disabled={salvandoArquivo || !validarMotivo(motivo)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {salvandoArquivo ? 'Movendo...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
```

**3g.** Remover a linha morta do cabeçalho, que não é mais alcançável depois da carga:

```tsx
        {erro && <p className="text-sm text-red-600">{erro}</p>}
```

(O erro de carga continua aparecendo no `if (!lista)`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest __tests__/components/EmTratamento.test.tsx` → PASS. Rode 3 vezes.
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

Atenção: enquanto um card estiver com o formulário "Movendo...", o "Confirmar" é o único com o texto "Movendo...". Se algum teste antigo quebrar por causa de nome de botão, ajuste a **consulta** do teste, nunca o texto visível.

- [ ] **Step 5: Commit**

```bash
git add src/app/relatorios/EmTratamento.tsx __tests__/components/EmTratamento.test.tsx && git commit -m "feat(relatorios): mensagem recolhida e mover para Pacientes Antigos com motivo"
```

---

## Task 6: Botão 📦 com motivo e motivo em Pacientes Antigos

**Files:**
- Modify: `src/components/ArchivePatientButton.tsx`
- Modify: `src/components/ArchivedPatientsList.tsx`
- Test: `__tests__/components/ArchivePatientButton.test.tsx`, `__tests__/components/ArchivedPatientsList.test.tsx`

- [ ] **Step 1: Testes que falham**

Criar `__tests__/components/ArchivePatientButton.test.tsx`:

```typescript
// __tests__/components/ArchivePatientButton.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchivePatientButton } from '@/components/ArchivePatientButton'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

let fetchMock: jest.Mock

beforeEach(() => {
  mockRefresh.mockClear()
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
  global.fetch = fetchMock as unknown as typeof fetch
})

const abrir = () => userEvent.click(screen.getByRole('button', { name: /Mover Ana Souza para Pacientes Antigos/ }))

describe('ArchivePatientButton', () => {
  it('abre a janela pedindo o motivo, com Confirmar bloqueado', async () => {
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    const janela = screen.getByRole('dialog')
    expect(janela).toHaveTextContent('Mover Ana Souza para Pacientes Antigos?')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  it('arquiva com o motivo limpo, fecha a janela e atualiza a página', async () => {
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    await userEvent.type(screen.getByLabelText(/Observações/), '  Mudou de cidade ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/patients/3/archive', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ motivo: 'Mudou de cidade', origem: 'card_paciente' })
    expect(await screen.findByRole('button', { name: /Mover Ana Souza/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('se falhar, mostra o erro e mantém a janela aberta', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    await userEvent.type(screen.getByLabelText(/Observações/), 'Mudou de cidade')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível mover para Pacientes Antigos')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('Cancelar fecha sem chamar o servidor', async () => {
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clicar dentro da janela não fecha nem propaga', async () => {
    const aoClicarFora = jest.fn()
    render(
      <div onClick={aoClicarFora}>
        <ArchivePatientButton patientId={3} patientName="Ana Souza" />
      </div>
    )
    await abrir()
    await userEvent.click(screen.getByLabelText(/Observações/))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(aoClicarFora).not.toHaveBeenCalled()
  })
})
```

Criar `__tests__/components/ArchivedPatientsList.test.tsx`:

```typescript
// __tests__/components/ArchivedPatientsList.test.tsx
import { render, screen } from '@testing-library/react'
import { ArchivedPatientsList } from '@/components/ArchivedPatientsList'
import type { ArchivedPatientItem } from '@/lib/patients'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const base = {
  start_date: '2026-07-01', duration: '12', notes: '', created_at: '2026-07-01T12:00:00.000Z',
  created_by: 'Carlos', completed_count: 0,
}

const pacientes: ArchivedPatientItem[] = [
  { ...base, id: 1, name: 'Ana Souza', archive_reason: 'Parou por custo', archived_by: 'Carlos', archive_event_at: '2026-09-17T17:00:00.000Z' },
  { ...base, id: 2, name: 'Bruno Lima', archive_reason: null, archived_by: null, archive_event_at: null },
]

describe('ArchivedPatientsList', () => {
  it('mostra o motivo, quem arquivou e a data', () => {
    render(<ArchivedPatientsList patients={pacientes} />)
    expect(screen.getByText('📝 Parou por custo — Carlos, 17/09/2026')).toBeInTheDocument()
  })

  it('quem foi arquivado sem motivo registrado não mostra a linha', () => {
    render(<ArchivedPatientsList patients={pacientes} />)
    expect(screen.getAllByText(/📝/)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/components/ArchivePatientButton.test.tsx __tests__/components/ArchivedPatientsList.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Botão com janela**

Substituir **todo** o conteúdo de `src/components/ArchivePatientButton.tsx` por:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validarMotivo, MOTIVO_MAX } from '@/lib/arquivo-paciente'

interface Props {
  patientId: number
  patientName: string
}

export function ArchivePatientButton({ patientId, patientName }: Props) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  function abrir(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMotivo('')
    setErro(null)
    setAberto(true)
  }

  function fechar() {
    if (!loading) setAberto(false)
  }

  async function confirmar() {
    const texto = validarMotivo(motivo)
    if (!texto) return
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(`/api/patients/${patientId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: texto, origem: 'card_paciente' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setAberto(false)
      router.refresh()
    } catch {
      setErro('Não foi possível mover para Pacientes Antigos. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        disabled={loading}
        title="Mover para Pacientes Antigos"
        aria-label={`Mover ${patientName} para Pacientes Antigos`}
        className="shrink-0 text-xs text-gray-300 hover:text-amber-500 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? '...' : '📦'}
      </button>

      {aberto && (
        // O botão fica fora do <Link> do card, mas o card inteiro é clicável
        // em volta: nenhum clique aqui pode propagar.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={e => { e.stopPropagation(); fechar() }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`arquivar-titulo-${patientId}`}
            className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h2 id={`arquivar-titulo-${patientId}`} className="text-base font-semibold text-gray-900">
              Mover {patientName} para Pacientes Antigos?
            </h2>
            <p className="text-sm text-gray-500">
              Todos os dados serão preservados e você poderá reativar quando quiser.
            </p>
            <label htmlFor={`motivo-card-${patientId}`} className="block text-xs font-medium text-gray-700">
              Observações — por que o paciente parou?
            </label>
            <textarea
              id={`motivo-card-${patientId}`}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              maxLength={MOTIVO_MAX}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={loading || !validarMotivo(motivo)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? 'Movendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Motivo na lista de antigos**

Em `src/components/ArchivedPatientsList.tsx`:

**4a.** Trocar `import { PatientListItem } from '@/lib/patients'` por:

```typescript
import type { ArchivedPatientItem } from '@/lib/patients'
```

**4b.** Trocar as três ocorrências do tipo `PatientListItem` (na interface `Props` e em `handleUnarchive`) por `ArchivedPatientItem`.

**4c.** Logo depois da função `avatarColor`:

```typescript

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function linhaMotivo(p: ArchivedPatientItem): string | null {
  if (!p.archive_reason) return null
  const quemQuando = [p.archived_by, p.archive_event_at && dataCurta(p.archive_event_at)]
    .filter(Boolean)
    .join(', ')
  return `📝 ${p.archive_reason}${quemQuando ? ` — ${quemQuando}` : ''}`
}
```

**4d.** Logo depois do `</p>` que fecha a linha de "Início: ..." (dentro do `<div className="min-w-0">`):

```tsx
                {linhaMotivo(p) && (
                  <p className="text-xs text-amber-800 mt-1 break-words">{linhaMotivo(p)}</p>
                )}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest __tests__/components/ArchivePatientButton.test.tsx __tests__/components/ArchivedPatientsList.test.tsx` → PASS (rode 3 vezes).
Run: `npx tsc --noEmit 2>&1 | grep -v "PatientCard.test"` → nenhuma linha.

- [ ] **Step 6: Commit**

```bash
git add src/components/ArchivePatientButton.tsx src/components/ArchivedPatientsList.tsx __tests__/components/ArchivePatientButton.test.tsx __tests__/components/ArchivedPatientsList.test.tsx && git commit -m "feat(arquivo): botao 📦 pede motivo e Pacientes Antigos mostra o motivo"
```

---

## Verificação final

- [ ] `npx jest`: as únicas suítes em FAIL são as 4 pré-existentes
- [ ] `npx tsc --noEmit`: nenhum erro novo
- [ ] `npm run build`: passa
- [ ] `grep -rn "archivePatient\|unarchivePatient" src`: nenhum resultado
- [ ] `git status`: nada solto, exceto `.claude/launch.json`, que já estava modificado antes
- [ ] Depois do deploy, o dono confere:
  - arquivar um paciente 🔴 pela aba Em tratamento, com motivo;
  - ver o motivo em Pacientes Antigos;
  - reativar;
  - abrir e fechar a mensagem de um card.
