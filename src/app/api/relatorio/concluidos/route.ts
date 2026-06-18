import { NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export async function GET() {
  await initSchema()

  // Pacientes cujo prazo de tratamento já encerrou (start_date + duration semanas <= hoje)
  // OU que tenham todas as 19 tarefas marcadas
  const rows = await sql<{
    id: number
    name: string
    start_date: string
    duration: string
    completed_count: number
    treatment_done: boolean
  }[]>`
    SELECT
      p.id,
      p.name,
      p.start_date,
      p.duration,
      COUNT(tc.id)::int AS completed_count,
      CASE
        WHEN p.start_date <> '' AND p.duration ~ '^[0-9]+$'
          AND (p.start_date::date + (p.duration::int * 7) * INTERVAL '1 day') <= NOW()
        THEN true
        ELSE false
      END AS treatment_done
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    GROUP BY p.id, p.name, p.start_date, p.duration
    HAVING
      COUNT(tc.id) >= 19
      OR (
        p.start_date <> '' AND p.duration ~ '^[0-9]+$'
        AND (p.start_date::date + (p.duration::int * 7) * INTERVAL '1 day') <= NOW()
      )
    ORDER BY p.name ASC
  `

  return NextResponse.json({ total: rows.length, patients: rows })
}
