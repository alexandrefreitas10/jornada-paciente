import sql, { initSchema } from './db'

export type FileType = 'photo' | 'bioimpedance' | 'exam' | 'diet' | 'evolution' | 'prescription' | 'estetica'

export type SummaryStatus = 'pending' | 'done' | 'error' | null

export interface PatientFile {
  id: number
  patient_id: number
  file_type: FileType
  s3_key: string
  original_name: string
  summary: string | null
  summary_status: SummaryStatus
  summary_error: string | null
  created_at: string
  created_by: string | null
}

export async function listPatientFiles(patientId: number, fileType: FileType): Promise<PatientFile[]> {
  await initSchema()
  return sql<PatientFile[]>`
    SELECT * FROM patient_files
    WHERE patient_id = ${patientId} AND file_type = ${fileType} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `
}

export async function createPatientFile(
  patientId: number,
  fileType: FileType,
  s3Key: string,
  originalName: string,
  summary?: string | null,
  createdBy?: string | null
): Promise<PatientFile> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`
    INSERT INTO patient_files (patient_id, file_type, s3_key, original_name, summary, created_by)
    VALUES (${patientId}, ${fileType}, ${s3Key}, ${originalName}, ${summary ?? null}, ${createdBy ?? null})
    RETURNING *
  `
  return row
}

export async function getFileById(id: number): Promise<PatientFile | null> {
  await initSchema()
  // Nunca devolve arquivo soft-deletado: um "excluído" não pode ser baixado/servido
  const [row] = await sql<PatientFile[]>`SELECT * FROM patient_files WHERE id = ${id} AND deleted_at IS NULL`
  return row ?? null
}

export async function deletePatientFile(id: number): Promise<string> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`
    DELETE FROM patient_files WHERE id = ${id} RETURNING *
  `
  return row.s3_key
}

export async function deletePatientFileAndReturn(id: number): Promise<PatientFile | null> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`
    DELETE FROM patient_files WHERE id = ${id} RETURNING *
  `
  return row ?? null
}

// Soft-delete: mantém o arquivo no S3 para possível restauração
export async function softDeletePatientFile(id: number): Promise<PatientFile | null> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`
    UPDATE patient_files SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL RETURNING *
  `
  return row ?? null
}

export async function updateFileSummary(id: number, summary: string): Promise<void> {
  await initSchema()
  await sql`UPDATE patient_files SET summary = ${summary}, summary_status = 'done', summary_error = NULL WHERE id = ${id}`
}

export async function setSummaryStatus(id: number, status: 'pending' | 'error', error?: string): Promise<void> {
  await initSchema()
  await sql`UPDATE patient_files SET summary_status = ${status}, summary_error = ${error ?? null} WHERE id = ${id}`
}

export async function restorePatientFile(id: number): Promise<void> {
  await initSchema()
  await sql`UPDATE patient_files SET deleted_at = NULL WHERE id = ${id}`
}

export async function listDeletedPatientFiles(patientId: number): Promise<PatientFile[]> {
  await initSchema()
  return sql<PatientFile[]>`
    SELECT * FROM patient_files
    WHERE patient_id = ${patientId} AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `
}
