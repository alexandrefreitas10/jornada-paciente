import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { last_implant_date, notes, patient_name } = body

  const [row] = await sql<{ id: number; patient_name: string; last_implant_date: string; next_implant_date: string; days_until: number; notes: string | null }[]>`
    UPDATE implants
    SET
      last_implant_date = COALESCE(${last_implant_date ?? null}, last_implant_date),
      notes = COALESCE(${notes ?? null}, notes),
      patient_name = COALESCE(${patient_name ?? null}, patient_name)
    WHERE id = ${Number(id)}
    RETURNING
      id, patient_id, patient_name,
      last_implant_date::text,
      (last_implant_date + INTERVAL '6 months')::date::text AS next_implant_date,
      ((last_implant_date + INTERVAL '6 months')::date - CURRENT_DATE)::int AS days_until,
      notes, created_at
  `
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await sql`DELETE FROM implants WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
}
