import { NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export async function GET() {
  await initSchema()

  const rows = await sql<{
    id: number
    name: string
    start_date: string
    duration: string
    completed_count: number
  }[]>`
    SELECT
      p.id,
      p.name,
      p.start_date,
      p.duration,
      COUNT(tc.id)::int AS completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    GROUP BY p.id, p.name, p.start_date, p.duration
    ORDER BY p.name ASC
  `

  const today = new Date()

  const result = rows
    .map(p => {
      const totalWeeks = parseInt(p.duration, 10)
      let treatmentDone = false
      if (p.start_date && !isNaN(totalWeeks) && totalWeeks > 0) {
        const end = new Date(p.start_date)
        end.setDate(end.getDate() + totalWeeks * 7)
        treatmentDone = end <= today
      }
      return { ...p, treatment_done: treatmentDone }
    })
    .filter(p => p.completed_count >= 20 || p.treatment_done)

  return NextResponse.json({ total: result.length, patients: result })
}
