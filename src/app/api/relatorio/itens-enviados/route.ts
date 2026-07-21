import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export async function GET(req: NextRequest) {
  await initSchema()
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const patientId = searchParams.get('patient_id')

  if (!from || !to) {
    return NextResponse.json({ error: 'Parâmetros from e to são obrigatórios' }, { status: 400 })
  }

  const rows = await sql<{
    id: number
    patient_id: number
    patient_name: string
    file_type: string
    original_name: string
    created_at: string
    created_by: string | null
  }[]>`
    SELECT pf.id, pf.patient_id, p.name as patient_name,
           pf.file_type, pf.original_name, pf.created_at, pf.created_by
    FROM patient_files pf
    JOIN patients p ON p.id = pf.patient_id
    WHERE (pf.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${from}::date
      AND (pf.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${to}::date
      ${patientId ? sql`AND pf.patient_id = ${Number(patientId)}` : sql``}
    ORDER BY pf.created_at DESC
  `

  return NextResponse.json({ total: rows.length, files: rows })
}
