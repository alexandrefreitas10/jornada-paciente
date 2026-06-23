import sql, { initSchema } from './db'

export interface AuditLog {
  id: number
  user_name: string
  action: string
  entity_type: string
  entity_id: string | null
  patient_id: number | null
  patient_name: string | null
  details: string | null
  deleted_data: Record<string, unknown> | null
  created_at: string
}

export async function logAudit(params: {
  userName: string
  action: string
  entityType: string
  entityId?: string | number
  patientId?: number
  details?: string
  deletedData?: object | null
}) {
  try {
    await initSchema()
    await sql`
      INSERT INTO audit_logs (user_name, action, entity_type, entity_id, patient_id, details, deleted_data)
      VALUES (
        ${params.userName},
        ${params.action},
        ${params.entityType},
        ${params.entityId?.toString() ?? null},
        ${params.patientId ?? null},
        ${params.details ?? null},
        ${params.deletedData != null ? sql.json(params.deletedData as never) : null}
      )
    `
  } catch (err) {
    console.error('[logAudit] erro ao salvar log:', err)
  }
}

export async function getAuditLogs(patientId?: number): Promise<AuditLog[]> {
  await initSchema()
  if (patientId != null) {
    return sql<AuditLog[]>`
      SELECT al.*, p.name AS patient_name
      FROM audit_logs al
      LEFT JOIN patients p ON p.id = al.patient_id
      WHERE al.patient_id = ${patientId}
      ORDER BY al.created_at DESC
    `
  }
  return sql<AuditLog[]>`
    SELECT al.*, p.name AS patient_name
    FROM audit_logs al
    LEFT JOIN patients p ON p.id = al.patient_id
    ORDER BY al.created_at DESC
    LIMIT 500
  `
}

export async function getAuditLog(id: number): Promise<AuditLog | null> {
  await initSchema()
  const [row] = await sql<AuditLog[]>`
    SELECT al.*, p.name AS patient_name
    FROM audit_logs al
    LEFT JOIN patients p ON p.id = al.patient_id
    WHERE al.id = ${id}
  `
  return row ?? null
}

export async function deleteAuditLog(id: number): Promise<void> {
  await initSchema()
  await sql`DELETE FROM audit_logs WHERE id = ${id}`
}
