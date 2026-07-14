import sql, { initSchema } from './db'

export interface SystemError {
  id: number
  source: string
  message: string
  context: Record<string, unknown> | null
  created_at: string
}

const MAX_MESSAGE = 2000

// Registra UMA falha silenciosa relevante. Regras:
// - NUNCA lança (engole o próprio erro) para não quebrar o fluxo chamador;
// - NÃO chama logAudit (evita recursão com audit.ts);
// - context deve conter só ids/códigos — NUNCA PHI (nome, conteúdo, transcrição).
export async function logSystemError(
  source: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await initSchema()
    await sql`
      INSERT INTO system_errors (source, message, context)
      VALUES (
        ${source},
        ${message.slice(0, MAX_MESSAGE)},
        ${context != null ? sql.json(context as never) : null}
      )
    `
  } catch (err) {
    // Último recurso: se o próprio log falhar (banco fora), cai no console e segue.
    console.error('[SYSTEM-ERROR-LOG-FAILED]', source, message,
      err instanceof Error ? err.message : String(err))
  }
}

export async function getRecentSystemErrors(limit = 200): Promise<SystemError[]> {
  await initSchema()
  return sql<SystemError[]>`
    SELECT * FROM system_errors ORDER BY created_at DESC LIMIT ${limit}
  `
}
