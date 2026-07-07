import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { last_implant_date, notes, patient_name, archive } = body

  const [row] = await sql<{ id: number; patient_name: string; last_implant_date: string; next_implant_date: string; days_until: number; notes: string | null; items_used: { name: string; quantity: number; unit: string }[]; archived_at: string | null }[]>`
    UPDATE implants
    SET
      last_implant_date = COALESCE(${last_implant_date ?? null}, last_implant_date),
      notes = COALESCE(${notes ?? null}, notes),
      patient_name = COALESCE(${patient_name ?? null}, patient_name),
      archived_at = CASE
        WHEN ${archive === true} THEN NOW()
        WHEN ${archive === false} THEN NULL
        ELSE archived_at
      END
    WHERE id = ${Number(id)}
    RETURNING
      id, patient_id, patient_name,
      last_implant_date::text,
      (last_implant_date + INTERVAL '6 months')::date::text AS next_implant_date,
      ((last_implant_date + INTERVAL '6 months')::date - CURRENT_DATE)::int AS days_until,
      notes,
      COALESCE(items_used, '[]'::jsonb) AS items_used,
      archived_at,
      created_at
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
