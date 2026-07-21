import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export async function GET(req: NextRequest) {
  await initSchema()
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'Parâmetros from e to são obrigatórios' }, { status: 400 })
  }

  const rows = await sql<{ id: number; name: string; created_at: string; created_by: string | null }[]>`
    SELECT id, name, created_at, created_by
    FROM patients
    WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${from}::date
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${to}::date
    ORDER BY created_at DESC
  `

  return NextResponse.json({ total: rows.length, patients: rows })
}
