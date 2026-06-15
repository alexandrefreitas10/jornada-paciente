# Evolução Semanal do Paciente — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar aba "Evolução" na página do paciente com registro semanal de métricas via upload de foto (IA) ou manual, e gráficos de linha separados para cada indicador.

**Architecture:** Nova tabela `weekly_measurements` no PostgreSQL. Backend com 5 rotas API. Frontend com abas em `PatientDetailClient` + componente `EvolutionTab` + componente `MeasurementChart`. Extração de foto via Claude Haiku.

**Tech Stack:** Next.js 16 App Router, TypeScript, postgres.js, @anthropic-ai/sdk, recharts, Tailwind CSS v4.

---

## Mapa de arquivos

| Ação | Arquivo |
|------|---------|
| Modificar | `src/lib/db.ts` — adicionar tabela weekly_measurements ao schema |
| Criar | `src/lib/measurements.ts` — CRUD functions |
| Criar | `src/app/api/patients/[id]/measurements/route.ts` — GET / POST |
| Criar | `src/app/api/patients/[id]/measurements/[mid]/route.ts` — PUT / DELETE |
| Criar | `src/app/api/patients/[id]/measurements/extract/route.ts` — POST (foto → IA → salvar) |
| Criar | `src/components/MeasurementChart.tsx` — gráfico de linha individual |
| Criar | `src/components/EvolutionTab.tsx` — aba completa de evolução |
| Modificar | `src/components/PatientDetailClient.tsx` — adicionar tabs + EvolutionTab |
| Modificar | `src/app/pacientes/[id]/page.tsx` — buscar measurements e passar para o client |

---

### Task 1: Instalar dependências

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar pacotes**

```bash
cd "C:\Users\alexa\Projeto Curso IA"
npm install recharts @anthropic-ai/sdk
```

Saída esperada: `added N packages` sem erros.

- [ ] **Step 2: Verificar instalação**

```bash
node -e "require('recharts'); require('@anthropic-ai/sdk'); console.log('OK')"
```

Saída esperada: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts and anthropic sdk"
```

---

### Task 2: Adicionar tabela weekly_measurements ao schema

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Editar initSchema para incluir nova tabela**

Em `src/lib/db.ts`, dentro de `sql.unsafe(...)`, acrescentar após o bloco `task_completions`:

```typescript
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  max: 10,
})

export async function initSchema() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS task_completions (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(patient_id, task_key)
    );
    CREATE TABLE IF NOT EXISTS weekly_measurements (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      week INTEGER,
      date TEXT,
      weight NUMERIC,
      abdominal_circumference NUMERIC,
      waist_circumference NUMERIC,
      tirzepatide_dose NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
}

export default sql
```

- [ ] **Step 2: Verificar que o servidor local sobe sem erros**

```bash
npm run dev
```

Acesse http://localhost:3000 e confirme que a página carrega normalmente. Ctrl+C para encerrar.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add weekly_measurements table to schema"
```

---

### Task 3: Criar src/lib/measurements.ts

**Files:**
- Create: `src/lib/measurements.ts`

- [ ] **Step 1: Criar o arquivo com interface e funções CRUD**

```typescript
// src/lib/measurements.ts
import sql from './db'
import { initSchema } from './db'

export interface Measurement {
  id: number
  patient_id: number
  week: number | null
  date: string | null
  weight: number | null
  abdominal_circumference: number | null
  waist_circumference: number | null
  tirzepatide_dose: number | null
  created_at: string
}

export interface MeasurementInput {
  week?: number | null
  date?: string | null
  weight?: number | null
  abdominal_circumference?: number | null
  waist_circumference?: number | null
  tirzepatide_dose?: number | null
}

export async function listMeasurements(patientId: number): Promise<Measurement[]> {
  await initSchema()
  const rows = await sql<Measurement[]>`
    SELECT * FROM weekly_measurements
    WHERE patient_id = ${patientId}
    ORDER BY week ASC NULLS LAST, created_at ASC
  `
  return rows
}

export async function createMeasurement(
  patientId: number,
  input: MeasurementInput
): Promise<Measurement> {
  await initSchema()
  const [row] = await sql<Measurement[]>`
    INSERT INTO weekly_measurements
      (patient_id, week, date, weight, abdominal_circumference, waist_circumference, tirzepatide_dose)
    VALUES
      (${patientId}, ${input.week ?? null}, ${input.date ?? null}, ${input.weight ?? null},
       ${input.abdominal_circumference ?? null}, ${input.waist_circumference ?? null},
       ${input.tirzepatide_dose ?? null})
    RETURNING *
  `
  return row
}

export async function updateMeasurement(
  id: number,
  input: MeasurementInput
): Promise<Measurement> {
  await initSchema()
  const [row] = await sql<Measurement[]>`
    UPDATE weekly_measurements SET
      week = ${input.week ?? null},
      date = ${input.date ?? null},
      weight = ${input.weight ?? null},
      abdominal_circumference = ${input.abdominal_circumference ?? null},
      waist_circumference = ${input.waist_circumference ?? null},
      tirzepatide_dose = ${input.tirzepatide_dose ?? null}
    WHERE id = ${id}
    RETURNING *
  `
  return row
}

export async function deleteMeasurement(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM weekly_measurements WHERE id = ${id}`
}
```

- [ ] **Step 2: Verificar que TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/measurements.ts
git commit -m "feat: add measurements lib with CRUD functions"
```

---

### Task 4: Criar API GET/POST /api/patients/[id]/measurements

**Files:**
- Create: `src/app/api/patients/[id]/measurements/route.ts`

- [ ] **Step 1: Criar o arquivo de rota**

```typescript
// src/app/api/patients/[id]/measurements/route.ts
import { NextRequest } from 'next/server'
import { listMeasurements, createMeasurement } from '@/lib/measurements'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const measurements = await listMeasurements(Number(id))
  return Response.json(measurements)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const measurement = await createMeasurement(Number(id), body)
  return Response.json(measurement, { status: 201 })
}
```

- [ ] **Step 2: Testar manualmente**

```bash
npm run dev
```

Em outro terminal:
```bash
curl -X POST http://localhost:3000/api/patients/1/measurements \
  -H "Content-Type: application/json" \
  -d '{"week":1,"date":"01/06/2025","weight":85.5}'
```

Saída esperada: JSON com o registro criado incluindo `id`.

```bash
curl http://localhost:3000/api/patients/1/measurements
```

Saída esperada: array JSON com o registro criado.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/patients/[id]/measurements/route.ts
git commit -m "feat: add GET/POST api route for measurements"
```

---

### Task 5: Criar API PUT/DELETE /api/patients/[id]/measurements/[mid]

**Files:**
- Create: `src/app/api/patients/[id]/measurements/[mid]/route.ts`

- [ ] **Step 1: Criar o arquivo de rota**

```typescript
// src/app/api/patients/[id]/measurements/[mid]/route.ts
import { NextRequest } from 'next/server'
import { updateMeasurement, deleteMeasurement } from '@/lib/measurements'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { mid } = await params
  const body = await req.json()
  const measurement = await updateMeasurement(Number(mid), body)
  return Response.json(measurement)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { mid } = await params
  await deleteMeasurement(Number(mid))
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 2: Testar manualmente** (substitua `<ID>` pelo id retornado na Task 4)

```bash
curl -X PUT http://localhost:3000/api/patients/1/measurements/<ID> \
  -H "Content-Type: application/json" \
  -d '{"week":1,"date":"01/06/2025","weight":84.0,"abdominal_circumference":95,"waist_circumference":88,"tirzepatide_dose":5}'
```

Saída esperada: JSON com valores atualizados.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/patients/[id]/measurements/[mid]/route.ts"
git commit -m "feat: add PUT/DELETE api route for individual measurement"
```

---

### Task 6: Criar rota de extração de foto via IA

**Files:**
- Create: `src/app/api/patients/[id]/measurements/extract/route.ts`

- [ ] **Step 1: Criar o arquivo de rota**

```typescript
// src/app/api/patients/[id]/measurements/extract/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createMeasurement } from '@/lib/measurements'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const formData = await req.formData()
  const photo = formData.get('photo') as File | null

  if (!photo) {
    return Response.json({ error: 'Foto não enviada' }, { status: 400 })
  }

  const arrayBuffer = await photo.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = (photo.type || 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Esta imagem contém uma tabela de acompanhamento de paciente. Extraia os dados e retorne APENAS um objeto JSON válido com estes campos (use null quando o valor não estiver presente):
{
  "week": <número inteiro da semana ou null>,
  "date": <data como string ou null>,
  "weight": <peso em kg como número decimal ou null>,
  "abdominal_circumference": <circunferência do abdômen em cm como número decimal ou null>,
  "waist_circumference": <circunferência da cintura em cm como número decimal ou null>,
  "tirzepatide_dose": <dose de tirzepatida em mg como número decimal ou null>
}
Retorne somente o JSON, sem texto adicional, sem markdown.`,
          },
        ],
      },
    ],
  })

  const text = (message.content[0] as { type: string; text: string }).text.trim()

  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(text)
  } catch {
    return Response.json(
      { error: 'Não foi possível extrair os dados da foto. Tente uma imagem mais nítida ou adicione manualmente.' },
      { status: 422 }
    )
  }

  const measurement = await createMeasurement(Number(id), {
    week: typeof extracted.week === 'number' ? extracted.week : null,
    date: typeof extracted.date === 'string' ? extracted.date : null,
    weight: typeof extracted.weight === 'number' ? extracted.weight : null,
    abdominal_circumference:
      typeof extracted.abdominal_circumference === 'number'
        ? extracted.abdominal_circumference
        : null,
    waist_circumference:
      typeof extracted.waist_circumference === 'number'
        ? extracted.waist_circumference
        : null,
    tirzepatide_dose:
      typeof extracted.tirzepatide_dose === 'number' ? extracted.tirzepatide_dose : null,
  })

  return Response.json(measurement, { status: 201 })
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/patients/[id]/measurements/extract/route.ts
git commit -m "feat: add photo extraction route using Claude Haiku"
```

---

### Task 7: Criar componente MeasurementChart

**Files:**
- Create: `src/components/MeasurementChart.tsx`

- [ ] **Step 1: Criar o componente de gráfico individual**

```typescript
// src/components/MeasurementChart.tsx
'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface ChartPoint {
  semana: number | string
  valor: number
}

interface Props {
  title: string
  unit: string
  data: ChartPoint[]
  color?: string
}

export function MeasurementChart({ title, unit, data, color = '#7c3aed' }: Props) {
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        {title} <span className="text-gray-400 font-normal">({unit})</span>
      </h4>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="semana"
            tick={{ fontSize: 11 }}
            label={{ value: 'Semana', position: 'insideBottom', offset: -2, fontSize: 11 }}
            height={36}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => [`${value} ${unit}`, title]}
            labelFormatter={(label) => `Semana ${label}`}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4, fill: color }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/MeasurementChart.tsx
git commit -m "feat: add MeasurementChart component using recharts"
```

---

### Task 8: Criar componente EvolutionTab

**Files:**
- Create: `src/components/EvolutionTab.tsx`

- [ ] **Step 1: Criar o componente completo**

```typescript
// src/components/EvolutionTab.tsx
'use client'

import { useState, useRef } from 'react'
import { Measurement, MeasurementInput } from '@/lib/measurements'
import { MeasurementChart } from './MeasurementChart'

interface Props {
  patientId: number
  initialMeasurements: Measurement[]
}

const emptyInput = (): MeasurementInput => ({
  week: null,
  date: null,
  weight: null,
  abdominal_circumference: null,
  waist_circumference: null,
  tirzepatide_dose: null,
})

export function EvolutionTab({ patientId, initialMeasurements }: Props) {
  const [measurements, setMeasurements] = useState<Measurement[]>(initialMeasurements)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<MeasurementInput>(emptyInput())
  const [addingNew, setAddingNew] = useState(false)
  const [newValues, setNewValues] = useState<MeasurementInput>(emptyInput())
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      const res = await fetch(`/api/patients/${patientId}/measurements/extract`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao processar a foto')
      }
      const created: Measurement = await res.json()
      setMeasurements((prev) => [...prev, created].sort((a, b) => (a.week ?? 999) - (b.week ?? 999)))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveEdit(id: number) {
    const res = await fetch(`/api/patients/${patientId}/measurements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editValues),
    })
    if (!res.ok) return
    const updated: Measurement = await res.json()
    setMeasurements((prev) => prev.map((m) => (m.id === id ? updated : m)))
    setEditingId(null)
  }

  async function handleDelete(id: number) {
    await fetch(`/api/patients/${patientId}/measurements/${id}`, { method: 'DELETE' })
    setMeasurements((prev) => prev.filter((m) => m.id !== id))
  }

  async function handleSaveNew() {
    const res = await fetch(`/api/patients/${patientId}/measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newValues),
    })
    if (!res.ok) return
    const created: Measurement = await res.json()
    setMeasurements((prev) => [...prev, created].sort((a, b) => (a.week ?? 999) - (b.week ?? 999)))
    setAddingNew(false)
    setNewValues(emptyInput())
  }

  function startEdit(m: Measurement) {
    setEditingId(m.id)
    setEditValues({
      week: m.week,
      date: m.date,
      weight: m.weight,
      abdominal_circumference: m.abdominal_circumference,
      waist_circumference: m.waist_circumference,
      tirzepatide_dose: m.tirzepatide_dose,
    })
  }

  const chartData = measurements.map((m) => ({ semana: m.week ?? '?', ...m }))

  const numVal = (v: string) => (v === '' ? null : Number(v))

  return (
    <div className="space-y-6">
      {/* Upload de foto */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Extraindo dados...
            </>
          ) : (
            <>📷 Enviar foto da tabela</>
          )}
        </button>
        {uploadError && (
          <p className="text-sm text-red-600">{uploadError}</p>
        )}
      </div>

      {/* Tabela de registros */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              {['Semana', 'Data', 'Peso (kg)', 'Abdômen (cm)', 'Cintura (cm)', 'Tirzepatida (mg)', ''].map(
                (h) => (
                  <th key={h} className="text-left py-2 px-2 text-xs font-semibold text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {measurements.map((m) =>
              editingId === m.id ? (
                <tr key={m.id} className="border-b border-gray-100 bg-violet-50">
                  {(['week', 'date', 'weight', 'abdominal_circumference', 'waist_circumference', 'tirzepatide_dose'] as const).map(
                    (field) => (
                      <td key={field} className="py-1 px-2">
                        <input
                          type={field === 'date' ? 'text' : 'number'}
                          value={editValues[field] ?? ''}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [field]: field === 'date' ? e.target.value || null : numVal(e.target.value),
                            }))
                          }
                          className="w-full border border-violet-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                        />
                      </td>
                    )
                  )}
                  <td className="py-1 px-2 whitespace-nowrap">
                    <button
                      onClick={() => handleSaveEdit(m.id)}
                      className="text-xs text-violet-700 font-medium hover:underline mr-2"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2">{m.week ?? '—'}</td>
                  <td className="py-2 px-2">{m.date ?? '—'}</td>
                  <td className="py-2 px-2">{m.weight ?? '—'}</td>
                  <td className="py-2 px-2">{m.abdominal_circumference ?? '—'}</td>
                  <td className="py-2 px-2">{m.waist_circumference ?? '—'}</td>
                  <td className="py-2 px-2">{m.tirzepatide_dose ?? '—'}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <button
                      onClick={() => startEdit(m)}
                      className="text-xs text-gray-400 hover:text-violet-600 mr-2"
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                      title="Apagar"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              )
            )}

            {/* Linha de novo registro */}
            {addingNew && (
              <tr className="border-b border-gray-100 bg-green-50">
                {(['week', 'date', 'weight', 'abdominal_circumference', 'waist_circumference', 'tirzepatide_dose'] as const).map(
                  (field) => (
                    <td key={field} className="py-1 px-2">
                      <input
                        type={field === 'date' ? 'text' : 'number'}
                        placeholder={field === 'date' ? 'dd/mm/aaaa' : ''}
                        value={newValues[field] ?? ''}
                        onChange={(e) =>
                          setNewValues((prev) => ({
                            ...prev,
                            [field]: field === 'date' ? e.target.value || null : numVal(e.target.value),
                          }))
                        }
                        className="w-full border border-green-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                    </td>
                  )
                )}
                <td className="py-1 px-2 whitespace-nowrap">
                  <button
                    onClick={handleSaveNew}
                    className="text-xs text-green-700 font-medium hover:underline mr-2"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => { setAddingNew(false); setNewValues(emptyInput()) }}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Cancelar
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!addingNew && (
          <button
            onClick={() => setAddingNew(true)}
            className="mt-3 text-sm text-violet-600 hover:text-violet-800 font-medium"
          >
            + Adicionar manualmente
          </button>
        )}
      </div>

      {/* Gráficos */}
      {measurements.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          <MeasurementChart
            title="Peso"
            unit="kg"
            data={measurements.filter((m) => m.weight != null).map((m) => ({ semana: m.week ?? '?', valor: Number(m.weight) }))}
            color="#7c3aed"
          />
          <MeasurementChart
            title="Circunferência do Abdômen"
            unit="cm"
            data={measurements.filter((m) => m.abdominal_circumference != null).map((m) => ({ semana: m.week ?? '?', valor: Number(m.abdominal_circumference) }))}
            color="#2563eb"
          />
          <MeasurementChart
            title="Circunferência da Cintura"
            unit="cm"
            data={measurements.filter((m) => m.waist_circumference != null).map((m) => ({ semana: m.week ?? '?', valor: Number(m.waist_circumference) }))}
            color="#059669"
          />
          <MeasurementChart
            title="Dose de Tirzepatida"
            unit="mg"
            data={measurements.filter((m) => m.tirzepatide_dose != null).map((m) => ({ semana: m.week ?? '?', valor: Number(m.tirzepatide_dose) }))}
            color="#d97706"
          />
        </div>
      )}

      {measurements.length === 0 && !addingNew && (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum registro ainda. Envie uma foto ou adicione manualmente.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/EvolutionTab.tsx
git commit -m "feat: add EvolutionTab component with photo upload and charts"
```

---

### Task 9: Atualizar PatientDetailClient com sistema de abas

**Files:**
- Modify: `src/components/PatientDetailClient.tsx`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```typescript
// src/components/PatientDetailClient.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientDetail } from '@/lib/patients'
import { Measurement } from '@/lib/measurements'
import { TASK_PHASES } from '@/lib/task-definitions'
import { ProgressBar } from './ProgressBar'
import { TaskPhase } from './TaskPhase'
import { PatientModal } from './PatientModal'
import { DeleteButton } from './DeleteButton'
import { EvolutionTab } from './EvolutionTab'

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

interface Props {
  patient: PatientDetail
  initialMeasurements: Measurement[]
}

export function PatientDetailClient({ patient, initialMeasurements }: Props) {
  const [completedKeys, setCompletedKeys] = useState<string[]>(patient.completed_task_keys)
  const [editOpen, setEditOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'tasks' | 'evolution'>('tasks')
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

      {/* Abas */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'tasks'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Tarefas
        </button>
        <button
          onClick={() => setActiveTab('evolution')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'evolution'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Evolução
        </button>
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab === 'tasks' ? (
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
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <EvolutionTab patientId={patient.id} initialMeasurements={initialMeasurements} />
        </div>
      )}

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

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/PatientDetailClient.tsx
git commit -m "feat: add Tarefas/Evolucao tabs to PatientDetailClient"
```

---

### Task 10: Atualizar página de detalhe para buscar measurements

**Files:**
- Modify: `src/app/pacientes/[id]/page.tsx`

- [ ] **Step 1: Atualizar a página para buscar e passar measurements**

```typescript
// src/app/pacientes/[id]/page.tsx
import { notFound } from 'next/navigation'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { PatientDetailClient } from '@/components/PatientDetailClient'

export const dynamic = 'force-dynamic'

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [patient, measurements] = await Promise.all([
    getPatient(Number(id)),
    listMeasurements(Number(id)),
  ])

  if (!patient) notFound()

  return <PatientDetailClient patient={patient} initialMeasurements={measurements} />
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Testar localmente**

```bash
npm run dev
```

Abra http://localhost:3000, clique em um paciente, confirme que:
- As abas "Tarefas" e "Evolução" aparecem
- "Tarefas" mostra o comportamento anterior sem regressão
- "Evolução" mostra a tabela vazia + botão de foto + botão "Adicionar manualmente"
- Ao clicar "+ Adicionar manualmente", aparece linha de nova entrada
- Ao salvar, o registro aparece na tabela
- Ao clicar ✏️, a linha entra em modo de edição

- [ ] **Step 4: Commit**

```bash
git add src/app/pacientes/[id]/page.tsx
git commit -m "feat: fetch measurements in patient page and pass to client"
```

---

### Task 11: Deploy e configuração da API key

**Files:**
- Nenhum arquivo novo — configuração no painel do Render

- [ ] **Step 1: Push para GitHub**

```bash
git push origin master
```

- [ ] **Step 2: Adicionar ANTHROPIC_API_KEY no Render**

1. Acesse o painel do Render → serviço **jornada-paciente** → aba **Environment**
2. Clique em **Add Environment Variable**
3. Nome: `ANTHROPIC_API_KEY`
4. Valor: (colar a chave gerada em console.anthropic.com)
5. Clicar **Save Changes** — o Render vai fazer redeploy automático

- [ ] **Step 3: Verificar deploy**

Aguarde o deploy terminar (aba Deploys → status Live) e acesse https://jornada-paciente.onrender.com.

Teste o fluxo completo:
- Abrir um paciente → aba Evolução
- Adicionar um registro manualmente
- Enviar uma foto de tabela e confirmar que os dados são extraídos e salvos
