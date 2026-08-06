import sql, { initSchema } from '@/lib/db'
import type {
  Level, MessageRole, Persona, ScenarioKey, TrainingKb,
  TrainingMessage, TrainingReport, TrainingSession,
} from './types'
import { averageOf, verdictFor } from './scoring'

export async function createSession(params: {
  userId: number
  level: Level
  scenario: ScenarioKey
  persona: Persona
  kb: TrainingKb
}): Promise<TrainingSession> {
  await initSchema()
  const [row] = await sql<TrainingSession[]>`
    INSERT INTO training_sessions (user_id, level, scenario, persona, kb_snapshot)
    VALUES (
      ${params.userId}, ${params.level}, ${params.scenario},
      ${sql.json(params.persona as never)}, ${sql.json(params.kb as never)}
    )
    RETURNING *
  `
  return row
}

export async function getSession(id: number): Promise<TrainingSession | null> {
  await initSchema()
  const [row] = await sql<TrainingSession[]>`SELECT * FROM training_sessions WHERE id = ${id}`
  return row ?? null
}

export async function listSessions(opts: { userId?: number; limit?: number } = {}): Promise<TrainingSession[]> {
  await initSchema()
  const limit = opts.limit ?? 50
  if (opts.userId != null) {
    return sql<TrainingSession[]>`
      SELECT * FROM training_sessions WHERE user_id = ${opts.userId}
      ORDER BY started_at DESC LIMIT ${limit}
    `
  }
  return sql<TrainingSession[]>`
    SELECT * FROM training_sessions ORDER BY started_at DESC LIMIT ${limit}
  `
}

export async function listMessages(sessionId: number): Promise<TrainingMessage[]> {
  await initSchema()
  return sql<TrainingMessage[]>`
    SELECT * FROM training_messages WHERE session_id = ${sessionId} ORDER BY position ASC
  `
}

export async function addMessages(
  sessionId: number,
  entries: { role: MessageRole; content: string }[]
): Promise<TrainingMessage[]> {
  await initSchema()
  const [{ next }] = await sql<{ next: number }[]>`
    SELECT COALESCE(MAX(position), 0) + 1 AS next FROM training_messages WHERE session_id = ${sessionId}
  `
  const saved: TrainingMessage[] = []
  for (let i = 0; i < entries.length; i++) {
    const [row] = await sql<TrainingMessage[]>`
      INSERT INTO training_messages (session_id, role, content, position)
      VALUES (${sessionId}, ${entries[i].role}, ${entries[i].content}, ${next + i})
      RETURNING *
    `
    saved.push(row)
  }
  return saved
}

// Quantas mensagens a SECRETÁRIA já mandou — é o teto de 30 da spec.
export async function countSecretariaMessages(sessionId: number): Promise<number> {
  await initSchema()
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM training_messages
    WHERE session_id = ${sessionId} AND role = 'secretaria'
  `
  return total
}

export async function markEnded(sessionId: number): Promise<void> {
  await initSchema()
  await sql`
    UPDATE training_sessions SET status = 'encerrada', ended_at = NOW()
    WHERE id = ${sessionId} AND status = 'em_andamento'
  `
}

export async function saveReport(sessionId: number, report: TrainingReport): Promise<TrainingSession> {
  await initSchema()
  const average = averageOf(report.scores)
  const hasRedFlag = report.redFlags.length > 0
  const verdict = verdictFor(average, hasRedFlag)
  const [row] = await sql<TrainingSession[]>`
    UPDATE training_sessions SET
      status = 'avaliada',
      outcome = ${report.outcome},
      scores = ${sql.json(report.scores as never)},
      average = ${average},
      has_red_flag = ${hasRedFlag},
      verdict = ${verdict},
      report = ${sql.json(report as never)},
      ended_at = COALESCE(ended_at, NOW())
    WHERE id = ${sessionId}
    RETURNING *
  `
  return row
}
