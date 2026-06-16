import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

type ContentType = 'evolution' | 'tasks' | 'photo' | 'bioimpedance' | 'exam' | 'diet'

export async function GET(req: NextRequest) {
  await initSchema()
  const { searchParams } = req.nextUrl
  const since = searchParams.get('since')
  const type = (searchParams.get('type') ?? 'evolution') as ContentType

  if (!since) {
    return NextResponse.json({ error: 'Parâmetro since é obrigatório' }, { status: 400 })
  }

  const rows = await (async () => {
    if (type === 'evolution') {
      return sql<{ id: number; name: string; duration: string; last_update: string | null }[]>`
        SELECT p.id, p.name, p.duration, MAX(m.created_at) as last_update
        FROM patients p
        LEFT JOIN weekly_measurements m ON m.patient_id = p.id
        GROUP BY p.id, p.name, p.duration
        HAVING MAX(m.created_at) < ${since}::timestamptz OR MAX(m.created_at) IS NULL
        ORDER BY last_update ASC NULLS FIRST, p.name ASC
      `
    }

    if (type === 'tasks') {
      return sql<{ id: number; name: string; duration: string; last_update: string | null }[]>`
        SELECT p.id, p.name, p.duration, MAX(tc.completed_at) as last_update
        FROM patients p
        LEFT JOIN task_completions tc ON tc.patient_id = p.id
        GROUP BY p.id, p.name, p.duration
        HAVING MAX(tc.completed_at) < ${since}::timestamptz OR MAX(tc.completed_at) IS NULL
        ORDER BY last_update ASC NULLS FIRST, p.name ASC
      `
    }

    // photo, bioimpedance, exam, diet — filtro por file_type
    return sql<{ id: number; name: string; duration: string; last_update: string | null }[]>`
      SELECT p.id, p.name, p.duration, MAX(pf.created_at) as last_update
      FROM patients p
      LEFT JOIN patient_files pf ON pf.patient_id = p.id AND pf.file_type = ${type}
      GROUP BY p.id, p.name, p.duration
      HAVING MAX(pf.created_at) < ${since}::timestamptz OR MAX(pf.created_at) IS NULL
      ORDER BY last_update ASC NULLS FIRST, p.name ASC
    `
  })()

  return NextResponse.json({ total: rows.length, patients: rows })
}
