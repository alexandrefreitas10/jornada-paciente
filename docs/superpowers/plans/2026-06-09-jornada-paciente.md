# Jornada do Paciente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma interface web interna para acompanhamento da jornada de pacientes, com cartões por paciente, tarefas pré-definidas agrupadas por fase, e persistência em SQLite.

**Architecture:** Next.js 14 App Router com API Routes para o backend e Server/Client Components para o frontend. O banco de dados SQLite fica num arquivo local `data/db.sqlite`. As 18 tarefas são definidas em código (`lib/task-definitions.ts`) e o banco armazena apenas quais foram concluídas.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, better-sqlite3, Jest, React Testing Library

---

## Estrutura de Arquivos

```
├── src/
│   ├── app/
│   │   ├── layout.tsx                        # Layout raiz com fonte e metadata
│   │   ├── page.tsx                          # Tela principal — lista de pacientes
│   │   ├── globals.css                       # Estilos globais Tailwind
│   │   ├── pacientes/[id]/
│   │   │   └── page.tsx                      # Tela de detalhe do paciente
│   │   └── api/
│   │       └── patients/
│   │           ├── route.ts                  # GET /api/patients, POST /api/patients
│   │           └── [id]/
│   │               ├── route.ts              # GET, PUT, DELETE /api/patients/[id]
│   │               └── tasks/[key]/
│   │                   └── route.ts          # POST, DELETE /api/patients/[id]/tasks/[key]
│   ├── lib/
│   │   ├── db.ts                             # Conexão SQLite + inicialização do schema
│   │   ├── patients.ts                       # Queries: listar, criar, buscar, editar, excluir
│   │   ├── task-completions.ts               # Queries: marcar e desmarcar tarefas
│   │   └── task-definitions.ts              # Constante TASK_PHASES com as 18 tarefas
│   └── components/
│       ├── ProgressBar.tsx                   # Barra de progresso visual (X/18)
│       ├── PatientCard.tsx                   # Cartão na lista principal
│       ├── PatientModal.tsx                  # Modal criar/editar paciente
│       ├── DeleteButton.tsx                  # Botão excluir com confirmação
│       └── TaskPhase.tsx                     # Grupo de tarefas de uma fase com checkboxes
├── __tests__/
│   ├── lib/
│   │   ├── patients.test.ts                  # Testa CRUD de pacientes no SQLite
│   │   └── task-completions.test.ts          # Testa marcar/desmarcar tarefas
│   └── components/
│       ├── ProgressBar.test.tsx
│       ├── PatientCard.test.tsx
│       └── TaskPhase.test.tsx
├── data/                                     # Criado em runtime — contém db.sqlite
├── jest.config.ts
├── jest.setup.ts
└── next.config.ts
```

---

## Task 1: Scaffolding do projeto

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `jest.config.ts`, `jest.setup.ts`

- [ ] **Step 1: Criar o projeto Next.js**

No diretório `C:\Users\alexa\Projeto Curso IA`, execute:

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

Quando perguntar se quer sobreescrever arquivos existentes, responda `y` apenas para os arquivos de configuração (não para os arquivos da pasta `docs/`).

- [ ] **Step 2: Instalar dependências**

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3 jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest
```

- [ ] **Step 3: Criar jest.config.ts**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  setupFilesAfterFramework: ['./jest.setup.ts'],
  projects: [
    {
      displayName: 'lib',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/lib/**/*.test.ts'],
      transform: { '^.+\\.(ts|tsx)$': ['ts-jest', {}] },
    },
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/components/**/*.test.tsx'],
      setupFilesAfterFramework: ['./jest.setup.ts'],
      transform: { '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }] },
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
  ],
}

export default createJestConfig(config)
```

- [ ] **Step 4: Criar jest.setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Criar pasta data no .gitignore**

Adicione ao `.gitignore` (já existente):

```
# SQLite database
/data/
```

- [ ] **Step 6: Verificar que o projeto inicia**

```bash
npm run dev
```

Esperado: servidor rodando em `http://localhost:3000` sem erros.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with SQLite and Jest"
```

---

## Task 2: Definição das tarefas (`task-definitions.ts`)

**Files:**
- Create: `src/lib/task-definitions.ts`
- Create: `__tests__/lib/task-definitions.test.ts`

- [ ] **Step 1: Escrever o teste**

```typescript
// __tests__/lib/task-definitions.test.ts
import { TASK_PHASES, ALL_TASK_KEYS } from '@/lib/task-definitions'

describe('task-definitions', () => {
  it('tem exatamente 6 fases', () => {
    expect(TASK_PHASES).toHaveLength(6)
  })

  it('tem exatamente 18 tarefas no total', () => {
    const total = TASK_PHASES.reduce((sum, phase) => sum + phase.tasks.length, 0)
    expect(total).toBe(18)
  })

  it('ALL_TASK_KEYS tem 18 itens únicos', () => {
    expect(ALL_TASK_KEYS).toHaveLength(18)
    expect(new Set(ALL_TASK_KEYS).size).toBe(18)
  })

  it('cada tarefa tem key e label', () => {
    for (const phase of TASK_PHASES) {
      for (const task of phase.tasks) {
        expect(task.key).toBeTruthy()
        expect(task.label).toBeTruthy()
      }
    }
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
npx jest __tests__/lib/task-definitions.test.ts --no-coverage
```

Esperado: FAIL — `Cannot find module '@/lib/task-definitions'`

- [ ] **Step 3: Criar o arquivo**

```typescript
// src/lib/task-definitions.ts
export interface Task {
  key: string
  label: string
}

export interface TaskPhase {
  key: string
  label: string
  icon: string
  tasks: Task[]
}

export const TASK_PHASES: TaskPhase[] = [
  {
    key: 'pre_consulta',
    label: 'Pré-consulta',
    icon: '📋',
    tasks: [
      { key: 'consulta_agendada', label: 'Consulta agendada' },
      { key: 'bioimpedancia_info', label: 'Informações da bioimpedância' },
      { key: 'questionario_pre', label: 'Questionário pré consulta' },
      { key: 'exames_prontuario', label: 'Exames / prontuário' },
    ],
  },
  {
    key: 'comercial',
    label: 'Comercial',
    icon: '💰',
    tasks: [
      { key: 'orcamento_enviado', label: 'Orçamento enviado' },
      { key: 'orcamento_fechado', label: 'Orçamento fechado' },
    ],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    icon: '💬',
    tasks: [
      { key: 'grupo_criado', label: 'Criação do grupo' },
      { key: 'fotos_grupo', label: 'Envio de fotos no grupo' },
      { key: 'bioimpedancia_grupo', label: 'Envio da bioimpedância no grupo' },
      { key: 'termos_assinados', label: 'Termos assinados' },
    ],
  },
  {
    key: 'procedimento',
    label: 'Procedimento',
    icon: '🏥',
    tasks: [
      { key: 'procedimento_agendado', label: 'Procedimento agendado' },
      { key: 'estoque_conferido', label: 'Estoque conferido' },
    ],
  },
  {
    key: 'nutricao',
    label: 'Nutrição',
    icon: '🥗',
    tasks: [
      { key: 'enviado_nutri', label: 'Enviado para nutri' },
      { key: 'agendado_nutri', label: 'Agendado com a nutri' },
      { key: 'dieta_recebida', label: 'Dieta recebida' },
    ],
  },
  {
    key: 'tratamento',
    label: 'Tratamento',
    icon: '💊',
    tasks: [
      { key: 'formulacoes_feitas', label: 'Formulações feitas' },
      { key: 'iniciou_medicacao', label: 'Iniciou medicação' },
      { key: 'retorno_agendado', label: 'Retorno agendado' },
    ],
  },
]

export const ALL_TASK_KEYS: string[] = TASK_PHASES.flatMap((phase) =>
  phase.tasks.map((task) => task.key)
)
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

```bash
npx jest __tests__/lib/task-definitions.test.ts --no-coverage
```

Esperado: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-definitions.ts __tests__/lib/task-definitions.test.ts
git commit -m "feat: add task phase definitions"
```

---

## Task 3: Camada de banco de dados — schema e conexão

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Criar `src/lib/db.ts`**

```typescript
// src/lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'db.sqlite')

function getDb(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  return db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      duration TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(patient_id, task_key)
    );
  `)
}

export const db = getDb()
```

- [ ] **Step 2: Verificar que não há erros de TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add SQLite connection and schema initialization"
```

---

## Task 4: Queries de pacientes (`patients.ts`)

**Files:**
- Create: `src/lib/patients.ts`
- Create: `__tests__/lib/patients.test.ts`

- [ ] **Step 1: Escrever os testes**

```typescript
// __tests__/lib/patients.test.ts
import Database from 'better-sqlite3'
import {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient,
} from '@/lib/patients'

// Usa banco em memória para testes isolados
let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  testDb.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      duration TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(patient_id, task_key)
    );
  `)
})

afterEach(() => {
  testDb.close()
})

describe('listPatients', () => {
  it('retorna lista vazia quando não há pacientes', () => {
    const result = listPatients(testDb)
    expect(result).toEqual([])
  })

  it('retorna pacientes com contagem de tarefas concluídas', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('João', '2026-06-01', '3 meses', '')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('consulta_agendada')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('bioimpedancia_info')

    const result = listPatients(testDb)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('João')
    expect(result[0].completed_count).toBe(2)
  })
})

describe('createPatient', () => {
  it('cria paciente e retorna o id', () => {
    const id = createPatient(testDb, { name: 'Maria', start_date: '2026-06-01', duration: '6 meses', notes: 'Sem glúten' })
    expect(id).toBe(1)
  })

  it('rejeita paciente sem nome', () => {
    expect(() => createPatient(testDb, { name: '', start_date: '', duration: '', notes: '' })).toThrow()
  })
})

describe('getPatient', () => {
  it('retorna null para id inexistente', () => {
    const result = getPatient(testDb, 999)
    expect(result).toBeNull()
  })

  it('retorna o paciente com as task_keys concluídas', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Carlos', '2026-06-01', '1 mês', '')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('consulta_agendada')

    const result = getPatient(testDb, 1)
    expect(result?.name).toBe('Carlos')
    expect(result?.completed_task_keys).toContain('consulta_agendada')
  })
})

describe('updatePatient', () => {
  it('atualiza campos do paciente', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Ana', '', '', '')
    updatePatient(testDb, 1, { name: 'Ana Paula', start_date: '2026-07-01', duration: '2 meses', notes: 'Nova obs' })
    const result = getPatient(testDb, 1)
    expect(result?.name).toBe('Ana Paula')
    expect(result?.notes).toBe('Nova obs')
  })
})

describe('deletePatient', () => {
  it('remove o paciente e suas tarefas (cascade)', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Pedro', '', '', '')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('consulta_agendada')

    deletePatient(testDb, 1)

    expect(getPatient(testDb, 1)).toBeNull()
    const tasks = testDb.prepare('SELECT * FROM task_completions WHERE patient_id = 1').all()
    expect(tasks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx jest __tests__/lib/patients.test.ts --no-coverage
```

Esperado: FAIL — `Cannot find module '@/lib/patients'`

- [ ] **Step 3: Criar `src/lib/patients.ts`**

```typescript
// src/lib/patients.ts
import Database from 'better-sqlite3'

export interface PatientRow {
  id: number
  name: string
  start_date: string
  duration: string
  notes: string
  created_at: string
}

export interface PatientListItem extends PatientRow {
  completed_count: number
}

export interface PatientDetail extends PatientRow {
  completed_task_keys: string[]
}

export interface PatientInput {
  name: string
  start_date: string
  duration: string
  notes: string
}

export function listPatients(db: Database.Database): PatientListItem[] {
  return db.prepare(`
    SELECT p.*, COUNT(tc.id) as completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all() as PatientListItem[]
}

export function createPatient(db: Database.Database, input: PatientInput): number {
  if (!input.name.trim()) throw new Error('name is required')
  const result = db.prepare(
    'INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)'
  ).run(input.name.trim(), input.start_date, input.duration, input.notes)
  return result.lastInsertRowid as number
}

export function getPatient(db: Database.Database, id: number): PatientDetail | null {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as PatientRow | undefined
  if (!patient) return null

  const completions = db.prepare(
    'SELECT task_key FROM task_completions WHERE patient_id = ?'
  ).all(id) as { task_key: string }[]

  return {
    ...patient,
    completed_task_keys: completions.map((c) => c.task_key),
  }
}

export function updatePatient(db: Database.Database, id: number, input: PatientInput): void {
  if (!input.name.trim()) throw new Error('name is required')
  db.prepare(
    'UPDATE patients SET name = ?, start_date = ?, duration = ?, notes = ? WHERE id = ?'
  ).run(input.name.trim(), input.start_date, input.duration, input.notes, id)
}

export function deletePatient(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM patients WHERE id = ?').run(id)
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

```bash
npx jest __tests__/lib/patients.test.ts --no-coverage
```

Esperado: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/patients.ts __tests__/lib/patients.test.ts
git commit -m "feat: add patient CRUD queries"
```

---

## Task 5: Queries de tarefas concluídas (`task-completions.ts`)

**Files:**
- Create: `src/lib/task-completions.ts`
- Create: `__tests__/lib/task-completions.test.ts`

- [ ] **Step 1: Escrever os testes**

```typescript
// __tests__/lib/task-completions.test.ts
import Database from 'better-sqlite3'
import { markTaskComplete, unmarkTaskComplete } from '@/lib/task-completions'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  testDb.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT, duration TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(patient_id, task_key)
    );
  `)
  testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Teste', '', '', '')
})

afterEach(() => { testDb.close() })

describe('markTaskComplete', () => {
  it('insere registro de conclusão', () => {
    markTaskComplete(testDb, 1, 'consulta_agendada')
    const row = testDb.prepare('SELECT * FROM task_completions WHERE patient_id = 1 AND task_key = ?').get('consulta_agendada')
    expect(row).toBeTruthy()
  })

  it('não falha se tarefa já estiver marcada (idempotente)', () => {
    markTaskComplete(testDb, 1, 'consulta_agendada')
    expect(() => markTaskComplete(testDb, 1, 'consulta_agendada')).not.toThrow()
  })
})

describe('unmarkTaskComplete', () => {
  it('remove registro de conclusão', () => {
    markTaskComplete(testDb, 1, 'consulta_agendada')
    unmarkTaskComplete(testDb, 1, 'consulta_agendada')
    const row = testDb.prepare('SELECT * FROM task_completions WHERE patient_id = 1 AND task_key = ?').get('consulta_agendada')
    expect(row).toBeUndefined()
  })

  it('não falha se tarefa não estava marcada (idempotente)', () => {
    expect(() => unmarkTaskComplete(testDb, 1, 'consulta_agendada')).not.toThrow()
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx jest __tests__/lib/task-completions.test.ts --no-coverage
```

Esperado: FAIL — `Cannot find module '@/lib/task-completions'`

- [ ] **Step 3: Criar `src/lib/task-completions.ts`**

```typescript
// src/lib/task-completions.ts
import Database from 'better-sqlite3'

export function markTaskComplete(
  db: Database.Database,
  patientId: number,
  taskKey: string
): void {
  db.prepare(
    'INSERT OR IGNORE INTO task_completions (patient_id, task_key) VALUES (?, ?)'
  ).run(patientId, taskKey)
}

export function unmarkTaskComplete(
  db: Database.Database,
  patientId: number,
  taskKey: string
): void {
  db.prepare(
    'DELETE FROM task_completions WHERE patient_id = ? AND task_key = ?'
  ).run(patientId, taskKey)
}
```

- [ ] **Step 4: Rodar os testes**

```bash
npx jest __tests__/lib/task-completions.test.ts --no-coverage
```

Esperado: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-completions.ts __tests__/lib/task-completions.test.ts
git commit -m "feat: add task completion queries"
```

---

## Task 6: API Routes — CRUD de pacientes

**Files:**
- Create: `src/app/api/patients/route.ts`
- Create: `src/app/api/patients/[id]/route.ts`

- [ ] **Step 1: Criar `src/app/api/patients/route.ts`**

```typescript
// src/app/api/patients/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listPatients, createPatient } from '@/lib/patients'

export async function GET() {
  try {
    const patients = listPatients(db)
    return NextResponse.json(patients)
  } catch {
    return NextResponse.json({ error: 'Erro ao listar pacientes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, start_date, duration, notes } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    const id = createPatient(db, { name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '' })
    return NextResponse.json({ id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro ao criar paciente' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Criar `src/app/api/patients/[id]/route.ts`**

```typescript
// src/app/api/patients/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPatient, updatePatient, deletePatient } from '@/lib/patients'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const patient = getPatient(db, Number(id))
  if (!patient) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(patient)
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  try {
    const body = await request.json()
    const { name, start_date, duration, notes } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    updatePatient(db, Number(id), { name, start_date: start_date ?? '', duration: duration ?? '', notes: notes ?? '' })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  deletePatient(db, Number(id))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Testar manualmente com o servidor rodando**

```bash
npm run dev
```

Em outro terminal:
```bash
# Criar paciente
curl -X POST http://localhost:3000/api/patients -H "Content-Type: application/json" -d "{\"name\":\"João Silva\",\"start_date\":\"2026-06-01\",\"duration\":\"3 meses\",\"notes\":\"Teste\"}"
# Esperado: {"id":1}

# Listar
curl http://localhost:3000/api/patients
# Esperado: [{...,"completed_count":0}]
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/patients/
git commit -m "feat: add patient CRUD API routes"
```

---

## Task 7: API Route — Marcar/desmarcar tarefas

**Files:**
- Create: `src/app/api/patients/[id]/tasks/[key]/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/patients/[id]/tasks/[key]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { markTaskComplete, unmarkTaskComplete } from '@/lib/task-completions'
import { ALL_TASK_KEYS } from '@/lib/task-definitions'

type Params = { params: Promise<{ id: string; key: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id, key } = await params
  if (!ALL_TASK_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 })
  }
  markTaskComplete(db, Number(id), key)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, key } = await params
  if (!ALL_TASK_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Tarefa inválida' }, { status: 400 })
  }
  unmarkTaskComplete(db, Number(id), key)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Testar manualmente**

```bash
# Marcar tarefa (com paciente id=1 criado na task anterior)
curl -X POST http://localhost:3000/api/patients/1/tasks/consulta_agendada
# Esperado: {"ok":true}

# Confirmar na listagem
curl http://localhost:3000/api/patients
# Esperado: completed_count: 1

# Desmarcar
curl -X DELETE http://localhost:3000/api/patients/1/tasks/consulta_agendada
# Esperado: {"ok":true}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/patients/
git commit -m "feat: add task completion API routes"
```

---

## Task 8: Componente `ProgressBar`

**Files:**
- Create: `src/components/ProgressBar.tsx`
- Create: `__tests__/components/ProgressBar.test.tsx`

- [ ] **Step 1: Escrever o teste**

```tsx
// __tests__/components/ProgressBar.test.tsx
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/ProgressBar'

describe('ProgressBar', () => {
  it('exibe contagem correta', () => {
    render(<ProgressBar completed={5} total={18} />)
    expect(screen.getByText('5 / 18 tarefas')).toBeInTheDocument()
  })

  it('barra tem largura proporcional', () => {
    const { container } = render(<ProgressBar completed={9} total={18} />)
    const bar = container.querySelector('[data-testid="progress-fill"]')
    expect(bar).toHaveStyle('width: 50%')
  })

  it('usa cor verde quando todas concluídas', () => {
    const { container } = render(<ProgressBar completed={18} total={18} />)
    const bar = container.querySelector('[data-testid="progress-fill"]')
    expect(bar?.className).toContain('bg-green-500')
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx jest __tests__/components/ProgressBar.test.tsx --no-coverage
```

Esperado: FAIL

- [ ] **Step 3: Criar o componente**

```tsx
// src/components/ProgressBar.tsx
interface Props {
  completed: number
  total: number
}

export function ProgressBar({ completed, total }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isComplete = completed === total

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Progresso</span>
        <span>{completed} / {total} tarefas</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          data-testid="progress-fill"
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar os testes**

```bash
npx jest __tests__/components/ProgressBar.test.tsx --no-coverage
```

Esperado: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/components/ProgressBar.tsx __tests__/components/ProgressBar.test.tsx
git commit -m "feat: add ProgressBar component"
```

---

## Task 9: Componente `PatientCard`

**Files:**
- Create: `src/components/PatientCard.tsx`
- Create: `__tests__/components/PatientCard.test.tsx`

- [ ] **Step 1: Escrever o teste**

```tsx
// __tests__/components/PatientCard.test.tsx
import { render, screen } from '@testing-library/react'
import { PatientCard } from '@/components/PatientCard'

const patient = {
  id: 1,
  name: 'Maria Souza',
  start_date: '2026-06-01',
  duration: '3 meses',
  notes: '',
  created_at: '2026-06-01',
  completed_count: 7,
}

describe('PatientCard', () => {
  it('exibe nome do paciente', () => {
    render(<PatientCard patient={patient} />)
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('exibe inicial do nome no avatar', () => {
    render(<PatientCard patient={patient} />)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('exibe contagem de tarefas', () => {
    render(<PatientCard patient={patient} />)
    expect(screen.getByText('7 / 18 tarefas')).toBeInTheDocument()
  })

  it('tem link para a página de detalhe', () => {
    render(<PatientCard patient={patient} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/pacientes/1')
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx jest __tests__/components/PatientCard.test.tsx --no-coverage
```

Esperado: FAIL

- [ ] **Step 3: Criar o componente**

```tsx
// src/components/PatientCard.tsx
import Link from 'next/link'
import { ProgressBar } from './ProgressBar'
import { PatientListItem } from '@/lib/patients'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]

function avatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

interface Props {
  patient: PatientListItem
}

export function PatientCard({ patient }: Props) {
  return (
    <Link href={`/pacientes/${patient.id}`} className="block">
      <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-violet-300 hover:shadow-sm transition-all">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${avatarColor(patient.name)}`}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 truncate">{patient.name}</div>
          <div className="text-xs text-gray-500 mb-2">
            {patient.start_date && `Início: ${patient.start_date}`}
            {patient.start_date && patient.duration && ' · '}
            {patient.duration}
          </div>
          <ProgressBar completed={patient.completed_count} total={18} />
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Rodar os testes**

```bash
npx jest __tests__/components/PatientCard.test.tsx --no-coverage
```

Esperado: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/components/PatientCard.tsx __tests__/components/PatientCard.test.tsx
git commit -m "feat: add PatientCard component"
```

---

## Task 10: Componente `TaskPhase`

**Files:**
- Create: `src/components/TaskPhase.tsx`
- Create: `__tests__/components/TaskPhase.test.tsx`

- [ ] **Step 1: Escrever o teste**

```tsx
// __tests__/components/TaskPhase.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskPhase } from '@/components/TaskPhase'

const phase = {
  key: 'pre_consulta',
  label: 'Pré-consulta',
  icon: '📋',
  tasks: [
    { key: 'consulta_agendada', label: 'Consulta agendada' },
    { key: 'bioimpedancia_info', label: 'Informações da bioimpedância' },
  ],
}

describe('TaskPhase', () => {
  it('exibe o nome da fase', () => {
    render(<TaskPhase phase={phase} completedKeys={[]} patientId={1} />)
    expect(screen.getByText('Pré-consulta')).toBeInTheDocument()
  })

  it('exibe todas as tarefas da fase', () => {
    render(<TaskPhase phase={phase} completedKeys={[]} patientId={1} />)
    expect(screen.getByText('Consulta agendada')).toBeInTheDocument()
    expect(screen.getByText('Informações da bioimpedância')).toBeInTheDocument()
  })

  it('marca tarefa como concluída quando já está em completedKeys', () => {
    render(<TaskPhase phase={phase} completedKeys={['consulta_agendada']} patientId={1} />)
    const checkbox = screen.getAllByRole('checkbox')[0]
    expect(checkbox).toBeChecked()
  })

  it('chama onToggle ao clicar num checkbox', async () => {
    const onToggle = jest.fn()
    render(<TaskPhase phase={phase} completedKeys={[]} patientId={1} onToggle={onToggle} />)
    await userEvent.click(screen.getAllByRole('checkbox')[0])
    expect(onToggle).toHaveBeenCalledWith('consulta_agendada', true)
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx jest __tests__/components/TaskPhase.test.tsx --no-coverage
```

Esperado: FAIL

- [ ] **Step 3: Criar o componente**

```tsx
// src/components/TaskPhase.tsx
'use client'

import { TaskPhase as TaskPhaseType } from '@/lib/task-definitions'

interface Props {
  phase: TaskPhaseType
  completedKeys: string[]
  patientId: number
  onToggle?: (taskKey: string, completed: boolean) => void
}

export function TaskPhase({ phase, completedKeys, onToggle }: Props) {
  const completedInPhase = phase.tasks.filter((t) => completedKeys.includes(t.key)).length

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {phase.icon} {phase.label}
        </h3>
        <span className="text-xs text-gray-400">{completedInPhase}/{phase.tasks.length}</span>
      </div>
      <div className="space-y-2">
        {phase.tasks.map((task) => {
          const isChecked = completedKeys.includes(task.key)
          return (
            <label
              key={task.key}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => onToggle?.(task.key, e.target.checked)}
                className="w-4 h-4 accent-violet-500 cursor-pointer"
              />
              <span className={isChecked ? 'line-through text-gray-400' : 'text-gray-700'}>
                {task.label}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar os testes**

```bash
npx jest __tests__/components/TaskPhase.test.tsx --no-coverage
```

Esperado: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskPhase.tsx __tests__/components/TaskPhase.test.tsx
git commit -m "feat: add TaskPhase component with checkbox toggle"
```

---

## Task 11: Componente `PatientModal` (criar/editar)

**Files:**
- Create: `src/components/PatientModal.tsx`

Não há lógica de negócio pura a testar aqui — é um formulário controlado. Testar via integração na tela principal (Task 12).

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/PatientModal.tsx
'use client'

import { useState } from 'react'

interface PatientFormData {
  name: string
  start_date: string
  duration: string
  notes: string
}

interface Props {
  initial?: PatientFormData
  onSave: (data: PatientFormData) => Promise<void>
  onClose: () => void
  title: string
}

export function PatientModal({ initial, onSave, onClose, title }: Props) {
  const [form, setForm] = useState<PatientFormData>(
    initial ?? { name: '', start_date: '', duration: '', notes: '' }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setLoading(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do paciente"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de início</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duração do tratamento</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              placeholder="Ex: 3 meses"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observações sobre o paciente..."
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PatientModal.tsx
git commit -m "feat: add PatientModal component"
```

---

## Task 12: Componente `DeleteButton`

**Files:**
- Create: `src/components/DeleteButton.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/DeleteButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  patientId: number
  patientName: string
}

export function DeleteButton({ patientId, patientName }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/patients/${patientId}`, { method: 'DELETE' })
    router.push('/')
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Excluir {patientName}?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-sm px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? 'Excluindo...' : 'Confirmar'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm px-3 py-1 text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
    >
      Excluir
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DeleteButton.tsx
git commit -m "feat: add DeleteButton component with confirmation"
```

---

## Task 13: Tela principal — lista de pacientes

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Atualizar `src/app/layout.tsx`**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Jornada do Paciente',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Criar `src/app/page.tsx`**

```tsx
// src/app/page.tsx
import { db } from '@/lib/db'
import { listPatients } from '@/lib/patients'
import { PatientCard } from '@/components/PatientCard'
import { NewPatientButton } from '@/components/NewPatientButton'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const patients = listPatients(db)

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jornada do Paciente</h1>
          <p className="text-sm text-gray-500 mt-1">{patients.length} paciente{patients.length !== 1 ? 's' : ''} cadastrado{patients.length !== 1 ? 's' : ''}</p>
        </div>
        <NewPatientButton />
      </div>

      {patients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">Nenhum paciente ainda</p>
          <p className="text-sm">Clique em &quot;+ Novo Paciente&quot; para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Criar `src/components/NewPatientButton.tsx`**

```tsx
// src/components/NewPatientButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientModal } from './PatientModal'

export function NewPatientButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  async function handleSave(data: { name: string; start_date: string; duration: string; notes: string }) {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Erro ao criar')
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
      >
        + Novo Paciente
      </button>
      {open && (
        <PatientModal
          title="Novo Paciente"
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Verificar no navegador**

```bash
npm run dev
```

Abra `http://localhost:3000` — deve mostrar a tela vazia com botão "+ Novo Paciente". Clique no botão, preencha o formulário e salve. O paciente deve aparecer na lista.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/components/NewPatientButton.tsx
git commit -m "feat: add main page with patient list"
```

---

## Task 14: Tela de detalhe do paciente

**Files:**
- Create: `src/app/pacientes/[id]/page.tsx`
- Create: `src/components/PatientDetailClient.tsx`

- [ ] **Step 1: Criar `src/components/PatientDetailClient.tsx`**

```tsx
// src/components/PatientDetailClient.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientDetail } from '@/lib/patients'
import { TASK_PHASES } from '@/lib/task-definitions'
import { ProgressBar } from './ProgressBar'
import { TaskPhase } from './TaskPhase'
import { PatientModal } from './PatientModal'
import { DeleteButton } from './DeleteButton'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

interface Props {
  patient: PatientDetail
}

export function PatientDetailClient({ patient }: Props) {
  const [completedKeys, setCompletedKeys] = useState<string[]>(patient.completed_task_keys)
  const [editOpen, setEditOpen] = useState(false)
  const router = useRouter()

  async function handleToggle(taskKey: string, completed: boolean) {
    setCompletedKeys((prev) =>
      completed ? [...prev, taskKey] : prev.filter((k) => k !== taskKey)
    )
    const method = completed ? 'POST' : 'DELETE'
    await fetch(`/api/patients/${patient.id}/tasks/${taskKey}`, { method })
  }

  async function handleEdit(data: { name: string; start_date: string; duration: string; notes: string }) {
    const res = await fetch(`/api/patients/${patient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Erro ao atualizar')
    router.refresh()
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Navegação */}
      <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1">
        ← Voltar
      </button>

      {/* Cabeçalho do paciente */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 ${avatarColor(patient.name)}`}>
            {patient.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{patient.name}</h1>
            <p className="text-sm text-gray-500">
              {patient.start_date && `Início: ${patient.start_date}`}
              {patient.start_date && patient.duration && ' · '}
              {patient.duration}
            </p>
            {patient.notes && (
              <p className="text-sm text-gray-500 italic mt-1">{patient.notes}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ✏️ Editar
            </button>
            <DeleteButton patientId={patient.id} patientName={patient.name} />
          </div>
        </div>
        <ProgressBar completed={completedKeys.length} total={18} />
      </div>

      {/* Tarefas por fase */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {TASK_PHASES.map((phase) => (
          <TaskPhase
            key={phase.key}
            phase={phase}
            completedKeys={completedKeys}
            patientId={patient.id}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {editOpen && (
        <PatientModal
          title="Editar Paciente"
          initial={{
            name: patient.name,
            start_date: patient.start_date,
            duration: patient.duration,
            notes: patient.notes,
          }}
          onSave={handleEdit}
          onClose={() => setEditOpen(false)}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 2: Criar `src/app/pacientes/[id]/page.tsx`**

```tsx
// src/app/pacientes/[id]/page.tsx
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getPatient } from '@/lib/patients'
import { PatientDetailClient } from '@/components/PatientDetailClient'

export const dynamic = 'force-dynamic'

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patient = getPatient(db, Number(id))
  if (!patient) notFound()
  return <PatientDetailClient patient={patient} />
}
```

- [ ] **Step 3: Testar no navegador**

```bash
npm run dev
```

1. Abrir `http://localhost:3000`
2. Criar um paciente via "+ Novo Paciente"
3. Clicar no cartão — deve abrir a tela de detalhe
4. Marcar algumas tarefas — a barra de progresso deve atualizar em tempo real
5. Clicar em "Editar" — modal deve abrir com dados preenchidos
6. Clicar em "Excluir" → "Confirmar" — deve voltar para a lista sem o paciente

- [ ] **Step 4: Rodar todos os testes**

```bash
npx jest --no-coverage
```

Esperado: todos PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/pacientes/ src/components/PatientDetailClient.tsx
git commit -m "feat: add patient detail page with task checklist"
```

---

## Task 15: Polimento final e verificação

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Rodar todos os testes uma última vez**

```bash
npx jest --no-coverage
```

Esperado: todos PASS, zero falhas.

- [ ] **Step 2: Build de produção**

```bash
npm run build
```

Esperado: build bem-sucedido sem erros de TypeScript ou warnings críticos.

- [ ] **Step 3: Testar fluxo completo**

```bash
npm run start
```

Verificar:
- [ ] Criar 2 pacientes diferentes
- [ ] Abrir cada um e marcar tarefas em fases diferentes
- [ ] A barra de progresso na tela principal reflete o número correto
- [ ] Editar um paciente — alterações aparecem na tela
- [ ] Excluir um paciente — some da lista
- [ ] Fechar e reabrir o servidor — dados persistem

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: complete patient journey interface"
```
