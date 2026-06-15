import sql, { initSchema } from './db'
import { PatientListItem } from './patients'

function parseDurationToDays(duration: string): number | null {
  if (!duration) return null
  const d = duration.trim().toLowerCase()

  const semanas = d.match(/^(\d+)\s*(semana|semanas|sem\b|s\b)/)
  if (semanas) return parseInt(semanas[1]) * 7

  const meses = d.match(/^(\d+)\s*(mes|mês|meses|m\b)/)
  if (meses) return parseInt(meses[1]) * 30

  const dias = d.match(/^(\d+)\s*(dia|dias|d\b)/)
  if (dias) return parseInt(dias[1])

  // número solto → semanas
  const num = d.match(/^(\d+)$/)
  if (num) return parseInt(num[1]) * 7

  return null
}

export interface PatientLastWeek extends PatientListItem {
  end_date: string
  days_remaining: number
}

export async function getPatientsInLastWeek(): Promise<PatientLastWeek[]> {
  await initSchema()
  const rows = await sql<PatientListItem[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    WHERE p.start_date IS NOT NULL AND p.start_date != ''
      AND p.duration IS NOT NULL AND p.duration != ''
    GROUP BY p.id
    ORDER BY p.start_date ASC
  `

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result: PatientLastWeek[] = []

  for (const p of rows) {
    const days = parseDurationToDays(p.duration)
    if (days === null) continue

    const start = new Date(p.start_date)
    if (isNaN(start.getTime())) continue

    const end = new Date(start)
    end.setDate(end.getDate() + days)

    const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysRemaining >= 0 && daysRemaining <= 7) {
      result.push({
        ...p,
        end_date: end.toISOString().split('T')[0],
        days_remaining: daysRemaining,
      })
    }
  }

  return result
}
