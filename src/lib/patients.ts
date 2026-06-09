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
