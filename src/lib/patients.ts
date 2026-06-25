import sql, { initSchema } from './db'

export interface PatientRow {
  id: number
  name: string
  start_date: string
  duration: string
  notes: string
  created_at: string
  created_by: string | null
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
  created_by?: string | null
}

export async function listPatients(): Promise<PatientListItem[]> {
  await initSchema()
  const rows = await sql<PatientListItem[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `
  return rows
}

export async function listArchivedPatients(): Promise<PatientListItem[]> {
  await initSchema()
  const rows = await sql<PatientListItem[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    WHERE p.deleted_at IS NULL AND p.archived_at IS NOT NULL
    GROUP BY p.id
    ORDER BY p.archived_at DESC
  `
  return rows
}

export async function archivePatient(id: number): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET archived_at = NOW() WHERE id = ${id}`
}

export async function unarchivePatient(id: number): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET archived_at = NULL WHERE id = ${id}`
}

export async function listDeletedPatients(): Promise<PatientListItem[]> {
  await initSchema()
  const rows = await sql<PatientListItem[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    WHERE p.deleted_at IS NOT NULL
    GROUP BY p.id
    ORDER BY p.deleted_at DESC
  `
  return rows
}

export async function createPatient(input: PatientInput): Promise<number> {
  if (!input.name.trim()) throw new Error('name is required')
  await initSchema()
  const rows = await sql`
    INSERT INTO patients (name, start_date, duration, notes, created_by)
    VALUES (${input.name.trim()}, ${input.start_date}, ${input.duration}, ${input.notes}, ${input.created_by ?? null})
    RETURNING id
  `
  return rows[0].id
}

export async function getPatient(id: number): Promise<PatientDetail | null> {
  await initSchema()
  const patients = await sql<PatientRow[]>`SELECT * FROM patients WHERE id = ${id}`
  if (patients.length === 0) return null

  const completions = await sql<{ task_key: string }[]>`
    SELECT task_key FROM task_completions WHERE patient_id = ${id}
  `

  return {
    ...patients[0],
    completed_task_keys: completions.map((c) => c.task_key),
  }
}

export async function updatePatient(id: number, input: PatientInput): Promise<void> {
  if (!input.name.trim()) throw new Error('name is required')
  await initSchema()
  await sql`
    UPDATE patients
    SET name = ${input.name.trim()}, start_date = ${input.start_date},
        duration = ${input.duration}, notes = ${input.notes}
    WHERE id = ${id}
  `
}

export async function deletePatient(id: number, deletedBy?: string | null): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET deleted_at = NOW(), deleted_by = ${deletedBy ?? null} WHERE id = ${id}`
}

export async function restorePatient(id: number): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET deleted_at = NULL WHERE id = ${id}`
}
