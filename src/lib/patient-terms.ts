import sql, { initSchema } from './db'

export interface PatientTerm {
  id: number
  patient_id: number
  title: string
  content: string
  status: 'draft' | 'sent' | 'signed' | 'declined'
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

export async function createPatientTerm(
  patientId: number, title: string, content: string, createdBy: string
): Promise<PatientTerm> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    INSERT INTO patient_terms (patient_id, title, content, created_by)
    VALUES (${patientId}, ${title}, ${content}, ${createdBy})
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

export async function getTermByToken(token: string): Promise<PatientTerm | null> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    SELECT * FROM patient_terms WHERE sign_token = ${token}
  `
  return row ?? null
}

export async function signTerm(token: string, signerName: string, signatureData: string): Promise<PatientTerm> {
  await initSchema()
  const [row] = await sql<PatientTerm[]>`
    UPDATE patient_terms
    SET status = 'signed', signed_at = NOW(), signer_name = ${signerName}, signature_data = ${signatureData}
    WHERE sign_token = ${token}
    RETURNING *
  `
  return row
}

export async function deletePatientTerm(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM patient_terms WHERE id = ${id}`
}
