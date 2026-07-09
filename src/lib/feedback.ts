import sql, { initSchema } from './db'

export interface PatientNps {
  id: number
  patient_id: number
  score: number
  comment: string | null
  created_at: string
}

export interface PatientFeedback {
  id: number
  patient_id: number
  message: string
  created_at: string
}

export async function hasAnsweredNps(patientId: number): Promise<boolean> {
  await initSchema()
  const [row] = await sql<{ id: number }[]>`SELECT id FROM patient_nps WHERE patient_id = ${patientId}`
  return !!row
}

export async function saveNps(patientId: number, score: number, comment: string | null): Promise<boolean> {
  await initSchema()
  const rows = await sql`
    INSERT INTO patient_nps (patient_id, score, comment)
    VALUES (${patientId}, ${score}, ${comment})
    ON CONFLICT (patient_id) DO NOTHING
    RETURNING id
  `
  return rows.length > 0
}

export async function listPatientFeedback(patientId: number): Promise<PatientFeedback[]> {
  await initSchema()
  return sql<PatientFeedback[]>`
    SELECT * FROM patient_feedback WHERE patient_id = ${patientId} ORDER BY created_at DESC
  `
}

export async function addPatientFeedback(patientId: number, message: string): Promise<void> {
  await initSchema()
  await sql`INSERT INTO patient_feedback (patient_id, message) VALUES (${patientId}, ${message})`
}

export async function adminListNps(): Promise<(PatientNps & { patient_name: string })[]> {
  await initSchema()
  return sql<(PatientNps & { patient_name: string })[]>`
    SELECT n.*, p.name AS patient_name
    FROM patient_nps n
    JOIN patients p ON p.id = n.patient_id
    ORDER BY n.created_at DESC
  `
}

export async function adminListFeedback(): Promise<(PatientFeedback & { patient_name: string })[]> {
  await initSchema()
  return sql<(PatientFeedback & { patient_name: string })[]>`
    SELECT f.*, p.name AS patient_name
    FROM patient_feedback f
    JOIN patients p ON p.id = f.patient_id
    ORDER BY f.created_at DESC
  `
}
