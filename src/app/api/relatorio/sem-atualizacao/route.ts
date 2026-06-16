import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export async function GET(req: NextRequest) {
  await initSchema()
  const { searchParams } = req.nextUrl
  const since = searchParams.get('since') // data de corte: sem atualização desde esta data

  if (!since) {
    return NextResponse.json({ error: 'Parâmetro since é obrigatório' }, { status: 400 })
  }

  // Pacientes cuja última atualização de evolução é anterior à data de corte,
  // ou que nunca tiveram nenhum registro de evolução
  const rows = await sql<{
    id: number
    name: string
    start_date: string
    duration: string
    created_at: string
    last_evolution: string | null
  }[]>`
    SELECT
      p.id,
      p.name,
      p.start_date,
      p.duration,
      p.created_at,
      MAX(m.created_at) as last_evolution
    FROM patients p
    LEFT JOIN weekly_measurements m ON m.patient_id = p.id
    GROUP BY p.id, p.name, p.start_date, p.duration, p.created_at
    HAVING MAX(m.created_at) < ${since}::timestamptz
        OR MAX(m.created_at) IS NULL
    ORDER BY last_evolution ASC NULLS FIRST, p.name ASC
  `

  return NextResponse.json({ total: rows.length, patients: rows })
}
