import sql, { initSchema } from './db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

export interface PatientUser {
  id: number
  patient_id: number
  email: string
  password_hash: string | null
  invite_token: string | null
  invite_used_at: string | null
  created_at: string
}

export async function findPortalUserByEmail(email: string): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`SELECT * FROM patient_users WHERE email = ${email.toLowerCase().trim()}`
  return row ?? null
}

export async function findPortalUserByPatientId(patientId: number): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`SELECT * FROM patient_users WHERE patient_id = ${patientId}`
  return row ?? null
}

export async function findPortalUserByToken(token: string): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`
    SELECT * FROM patient_users
    WHERE invite_token = ${token}::uuid
      AND invite_used_at IS NULL
  `
  return row ?? null
}

export async function createPortalInvite(patientId: number, email: string): Promise<string> {
  await initSchema()
  const token = randomUUID()
  const normalizedEmail = email.toLowerCase().trim()

  await sql`UPDATE patients SET email = ${normalizedEmail} WHERE id = ${patientId}`

  await sql`
    INSERT INTO patient_users (patient_id, email, invite_token)
    VALUES (${patientId}, ${normalizedEmail}, ${token}::uuid)
    ON CONFLICT (patient_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      invite_token = EXCLUDED.invite_token,
      invite_used_at = NULL,
      password_hash = NULL
  `
  return token
}

export async function activatePortalUser(token: string, password: string): Promise<boolean> {
  await initSchema()
  const user = await findPortalUserByToken(token)
  if (!user) return false

  const hash = await bcrypt.hash(password, 12)
  await sql`
    UPDATE patient_users
    SET password_hash = ${hash},
        invite_token = NULL,
        invite_used_at = NOW()
    WHERE id = ${user.id}
  `
  return true
}

export async function revokePortalAccess(patientId: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM patient_users WHERE patient_id = ${patientId}`
  await sql`UPDATE patients SET email = NULL WHERE id = ${patientId}`
}
