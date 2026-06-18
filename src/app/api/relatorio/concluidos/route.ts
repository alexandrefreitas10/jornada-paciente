import { NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

const TOTAL_TASKS = 19

export async function GET() {
  await initSchema()

  const rows = await sql<{ id: number; name: string; start_date: string; duration: string; completed_count: number }[]>`
    SELECT
      p.id,
      p.name,
      p.start_date,
      p.duration,
      COUNT(tc.id)::int AS completed_count
    FROM patients p
    LEFT JOIN task_completions tc ON tc.patient_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    HAVING COUNT(tc.id) >= ${TOTAL_TASKS}
    ORDER BY p.name ASC
  `

  return NextResponse.json({ total: rows.length, patients: rows })
}
