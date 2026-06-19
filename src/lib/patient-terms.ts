import sql, { initSchema } from './db'

export interface PatientTerm {
  id: number
  patient_id: number
  title: string
  content: string
  file_s3_key: string | null
  file_name: string | null
  file_mime: string | null
  fields: string[]
  filled_fields: Record<string, string>
  signed_file_s3_key: string | null
  status: 'draft' | 'sent' | 'signed'
  created_by: string
  created_at: string
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
  signature_data: string | null
  sign_token: string | null
}

export async function listPatientTerms(patientId: number): Promise<PatientTerm[]> {
  await initSchema()
  return sql<PatientTerm[]>`
    SELECT * FROM patient_terms WHERE patient_id = ${patientId} ORDER BY created_at DESC
  `
}

export async function createTextTerm(
  patientId: number,
  title: string,
  createdBy: string,
  content: string,
): Promise<PatientTerm> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    INSERT INTO patient_terms (patient_id, title, content, created_by)
    VALUES (${patientId}, ${title}, ${content}, ${createdBy})
    RETURNING *
  `
  return row
}

export async function createPatientTerm(
  patientId: number,
  title: string,
  createdBy: string,
  fileS3Key: string,
  fileName: string,
  fileMime: string,
  fields: string[] = [],
): Promise<PatientTerm> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    INSERT INTO patient_terms (patient_id, title, content, file_s3_key, file_name, file_mime, created_by, fields)
    VALUES (${patientId}, ${title}, '', ${fileS3Key}, ${fileName}, ${fileMime}, ${createdBy}, ${JSON.stringify(fields)})
    RETURNING *
  `
  return row
}

export async function generateSignToken(termId: number): Promise<PatientTerm> {
  await initSchema()
  const token = crypto.randomUUID()
  const [row] = await sql<PatientTerm[]>`
    UPDATE patient_terms
    SET sign_token = ${token}, status = 'sent', sent_at = NOW()
    WHERE id = ${termId}
    RETURNING *
  `
  return row
}

export async function getTermById(id: number): Promise<PatientTerm | null> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`SELECT * FROM patient_terms WHERE id = ${id}`
  return row ?? null
}

export async function getTermByToken(token: string): Promise<PatientTerm | null> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`SELECT * FROM patient_terms WHERE sign_token = ${token}`
  return row ?? null
}

export async function signTerm(
  token: string, signerName: string, signatureData: string,
  filledFields: Record<string, string> = {}, signedFileS3Key: string | null = null
): Promise<PatientTerm> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    UPDATE patient_terms
    SET status = 'signed', signed_at = NOW(), signer_name = ${signerName},
        signature_data = ${signatureData}, filled_fields = ${JSON.stringify(filledFields)},
        signed_file_s3_key = ${signedFileS3Key}
    WHERE sign_token = ${token}
    RETURNING *
  `
  return row
}

export async function signTermWithFile(
  token: string, signerName: string, signatureData: string,
  filledS3Key: string, filledFileName: string,
  filledFields: Record<string, string> = {}, signedFileS3Key: string | null = null
): Promise<PatientTerm> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    UPDATE patient_terms
    SET status = 'signed', signed_at = NOW(), signer_name = ${signerName},
        signature_data = ${signatureData}, filled_fields = ${JSON.stringify(filledFields)},
        file_s3_key = ${filledS3Key}, file_name = ${filledFileName},
        signed_file_s3_key = ${signedFileS3Key}
    WHERE sign_token = ${token}
    RETURNING *
  `
  return row
}

export async function deletePatientTerm(id: number): Promise<{ file_s3_key: string | null }> {
  await initSchema()
  const [row] = await sql<{ file_s3_key: string | null }[]>`
    DELETE FROM patient_terms WHERE id = ${id} RETURNING file_s3_key
  `
  return row
}
