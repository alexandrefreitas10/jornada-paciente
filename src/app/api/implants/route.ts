import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { initSchema } from '@/lib/db'
import { auth } from '@/auth'
import { resolverPacienteId } from '@/lib/patient-link'

export const dynamic = 'force-dynamic'

export async function GET() {
  await initSchema()
  const rows = await sql<{
    id: number
    patient_id: number | null
    patient_name: string
    last_implant_date: string
    next_implant_date: string
    days_until: number
    notes: string | null
    items_used: { name: string; quantity: number; unit: string }[]
    created_at: string
  }[]>`
    SELECT
      id,
      patient_id,
      patient_name,
      last_implant_date::text,
      (last_implant_date + INTERVAL '6 months')::date::text AS next_implant_date,
      ((last_implant_date + INTERVAL '6 months')::date - CURRENT_DATE)::int AS days_until,
      notes,
      COALESCE(items_used, '[]'::jsonb) AS items_used,
      archived_at,
      created_at
    FROM implants
    ORDER BY (last_implant_date + INTERVAL '6 months') ASC
  `
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  await initSchema()
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const { patient_id, patient_name, last_implant_date, notes, items_used } = await req.json()

  if (!patient_name || !last_implant_date) {
    return NextResponse.json({ error: 'patient_name e last_implant_date são obrigatórios' }, { status: 400 })
  }

  const itemsJson = JSON.stringify(items_used ?? [])

  // A renovação manda o patient_id do registro anterior, que pode estar
  // desatualizado (nulo de quando a pessoa ainda não era paciente). Quando
  // não vem id, o nome resolve.
  const vinculo = await resolverPacienteId(patient_id, patient_name)

  const [row] = await sql<{ id: number; patient_id: number | null; patient_name: string; last_implant_date: string; next_implant_date: string; days_until: number; notes: string | null; items_used: { name: string; quantity: number; unit: string }[]; created_at: string }[]>`
    INSERT INTO implants (patient_id, patient_name, last_implant_date, notes, items_used, created_by)
    VALUES (${vinculo}, ${patient_name}, ${last_implant_date}, ${notes ?? null}, ${itemsJson}::jsonb, ${createdBy})
    RETURNING
      id, patient_id, patient_name,
      last_implant_date::text,
      (last_implant_date + INTERVAL '6 months')::date::text AS next_implant_date,
      ((last_implant_date + INTERVAL '6 months')::date - CURRENT_DATE)::int AS days_until,
      notes,
      COALESCE(items_used, '[]'::jsonb) AS items_used,
      created_at
  `
  return NextResponse.json(row, { status: 201 })
}
