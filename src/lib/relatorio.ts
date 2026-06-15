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

function parseDurationToWeeks(duration: string): number | null {
  const days = parseDurationToDays(duration)
  return days !== null ? Math.round(days / 7) : null
}

export interface PatientLastWeek extends PatientListItem {
  end_date: string
  days_remaining: number
  current_week: number | null
  total_weeks: number | null
  reason: 'calendar' | 'evolution' | 'both'
}

export async function getPatientsInLastWeek(): Promise<PatientLastWeek[]> {
  await initSchema()

  const rows = await sql<(PatientListItem & { max_week: number | null })[]>`
    SELECT p.*, COUNT(tc.id)::int as completed_count,
           MAX(m.week) as max_week
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    LEFT JOIN weekly_measurements m ON m.patient_id = p.id
    WHERE p.duration IS NOT NULL AND p.duration != ''
    GROUP BY p.id
    ORDER BY p.start_date ASC
  `

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result: PatientLastWeek[] = []

  for (const p of rows) {
    const totalWeeks = parseDurationToWeeks(p.duration)
    if (totalWeeks === null) continue

    const currentWeek: number | null = p.max_week ?? null

    // Critério 1: baseado em datas (start_date + duração)
    let daysRemaining: number | null = null
    let endDateStr = ''
    let calendarMatch = false

    if (p.start_date) {
      const start = new Date(p.start_date)
      if (!isNaN(start.getTime())) {
        const days = parseDurationToDays(p.duration)!
        const end = new Date(start)
        end.setDate(end.getDate() + days)
        daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        endDateStr = end.toISOString().split('T')[0]
        calendarMatch = daysRemaining >= 0 && daysRemaining <= 7
      }
    }

    // Critério 2: baseado na semana da aba Evolução
    // "última semana" = paciente está na última ou penúltima semana registrada
    const evolutionMatch =
      currentWeek !== null && totalWeeks >= 1 && currentWeek >= totalWeeks - 1

    if (!calendarMatch && !evolutionMatch) continue

    // Se só tem critério de evolução mas não tem data de início, usa semanas para estimar dias restantes
    if (!endDateStr && evolutionMatch && p.start_date) {
      const start = new Date(p.start_date)
      if (!isNaN(start.getTime())) {
        const days = parseDurationToDays(p.duration)!
        const end = new Date(start)
        end.setDate(end.getDate() + days)
        daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        endDateStr = end.toISOString().split('T')[0]
      }
    }

    const reason: PatientLastWeek['reason'] =
      calendarMatch && evolutionMatch ? 'both' : calendarMatch ? 'calendar' : 'evolution'

    result.push({
      ...p,
      end_date: endDateStr,
      days_remaining: daysRemaining ?? 0,
      current_week: currentWeek,
      total_weeks: totalWeeks,
      reason,
    })
  }

  return result
}
