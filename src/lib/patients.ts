import sql, { initSchema } from './db'
import { ehTipoPaciente, tipoDe } from './tipo-paciente'

export interface PatientRow {
  id: number
  name: string
  /** 'nutrologia' ou 'estetica' — ver `src/lib/tipo-paciente.ts`. */
  tipo: string
  phone: string | null
  start_date: string
  duration: string
  notes: string
  created_at: string
  created_by: string | null
}

export interface PatientListItem extends PatientRow {
  completed_count: number
}

export interface ArchivedPatientItem extends PatientListItem {
  archive_reason: string | null
  archived_by: string | null
  archive_event_at: Date | string | null
}

export interface PatientDetail extends PatientRow {
  completed_task_keys: string[]
}

export interface PatientInput {
  name: string
  /** Omitido = nutrologia, que é o que todo paciente existente é. */
  tipo?: string
  /** Só dígitos, com DDD. Vazio = sem telefone. */
  phone: string
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

export async function listArchivedPatients(): Promise<ArchivedPatientItem[]> {
  await initSchema()
  // O motivo vem do último arquivamento registrado. Quem foi arquivado antes
  // do histórico existir fica com os três campos nulos.
  const rows = await sql<ArchivedPatientItem[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count,
           ev.reason AS archive_reason,
           ev.created_by AS archived_by,
           ev.created_at AS archive_event_at
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    LEFT JOIN LATERAL (
      SELECT e.reason, e.created_by, e.created_at
      FROM patient_archive_events e
      WHERE e.patient_id = p.id AND e.action = 'arquivado'
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 1
    ) ev ON true
    WHERE p.deleted_at IS NULL AND p.archived_at IS NOT NULL
    GROUP BY p.id, ev.reason, ev.created_by, ev.created_at
    ORDER BY p.archived_at DESC
  `
  return rows
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
    INSERT INTO patients (name, start_date, duration, notes, phone, created_by, tipo)
    VALUES (${input.name.trim()}, ${input.start_date}, ${input.duration}, ${input.notes}, ${input.phone || null}, ${input.created_by ?? null}, ${tipoDe(input.tipo)})
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

// Dados básicos editáveis pelo próprio paciente no portal (nome NÃO muda).
export async function updatePatientProfile(
  id: number,
  input: { birth_date?: string | null; phone?: string | null; email?: string | null }
): Promise<void> {
  await initSchema()
  await sql`
    UPDATE patients SET
      birth_date = ${input.birth_date ?? null},
      phone = ${input.phone ?? null},
      email = ${input.email ?? null}
    WHERE id = ${id}
  `
}

export async function updatePatientAvatar(id: number, s3Key: string): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET avatar_s3_key = ${s3Key} WHERE id = ${id}`
}

export async function updatePatient(id: number, input: PatientInput): Promise<void> {
  if (!input.name.trim()) throw new Error('name is required')
  await initSchema()
  await sql`
    UPDATE patients
    SET name = ${input.name.trim()}, start_date = ${input.start_date},
        duration = ${input.duration}, notes = ${input.notes},
        -- Telefone em branco significa "não mexe", não "apaga": a aba da ficha
        -- aberta ANTES de alguém preencher o número pelo card de Em tratamento
        -- ainda carrega phone = null, e salvar o nome por ali zeraria o que
        -- acabou de ser coletado. Nada no app precisa limpar um telefone.
        phone = COALESCE(${input.phone || null}, phone),
        -- Mesma ideia do telefone: tipo ausente quer dizer "não mexe", não
        -- "volta para nutrologia". Sem isso, uma aba antiga do navegador (que
        -- não conhece o campo) converteria uma cliente de estética em paciente
        -- da nutrologia só por salvar uma correção de nome.
        tipo = COALESCE(${ehTipoPaciente(input.tipo) ? input.tipo : null}, tipo)
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

/** Altera SÓ o telefone. Não existe para ser genérica: a rota de perfil do
 *  portal regrava nascimento e e-mail juntos e apagaria os dois. */
export async function updatePatientPhone(id: number, phone: string): Promise<void> {
  await initSchema()
  await sql`UPDATE patients SET phone = ${phone || null} WHERE id = ${id}`
}
