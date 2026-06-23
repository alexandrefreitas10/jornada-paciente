import sql, { initSchema } from './db'

export async function logAudit(params: {
  userName: string
  action: string
  entityType: string
  entityId?: string | number
  patientId?: number
  details?: string
}) {
  try {
    await initSchema()
    await sql`
      INSERT INTO audit_logs (user_name, action, entity_type, entity_id, patient_id, details)
      VALUES (
        ${params.userName},
        ${params.action},
        ${params.entityType},
        ${params.entityId?.toString() ?? null},
        ${params.patientId ?? null},
        ${params.details ?? null}
      )
    `
  } catch {
    // log silencioso — nunca bloqueia a operação principal
  }
}
