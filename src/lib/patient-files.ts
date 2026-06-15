import sql, { initSchema } from './db'

export type FileType = 'photo' | 'bioimpedance' | 'exam' | 'diet'

export interface PatientFile {
  id: number
  patient_id: number
  file_type: FileType
  s3_key: string
  original_name: string
  summary: string | null
  created_at: string
}

export async function listPatientFiles(patientId: number, fileType: FileType): Promise<PatientFile[]> {
  await initSchema()
  return sql<PatientFile[]>`
    SELECT * FROM patient_files
    WHERE patient_id = ${patientId} AND file_type = ${fileType}
    ORDER BY created_at DESC
  `
}

export async function createPatientFile(
  patientId: number,
  fileType: FileType,
  s3Key: string,
  originalName: string,
  summary?: string | null
): Promise<PatientFile> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`
    INSERT INTO patient_files (patient_id, file_type, s3_key, original_name, summary)
    VALUES (${patientId}, ${fileType}, ${s3Key}, ${originalName}, ${summary ?? null})
    RETURNING *
  `
  return row
}

export async function getFileById(id: number): Promise<PatientFile | null> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`SELECT * FROM patient_files WHERE id = ${id}`
  return row ?? null
}

export async function deletePatientFile(id: number): Promise<string> {
  await initSchema()
  const [row] = await sql<PatientFile[]>`
    DELETE FROM patient_files WHERE id = ${id} RETURNING *
  `
  return row.s3_key
}
