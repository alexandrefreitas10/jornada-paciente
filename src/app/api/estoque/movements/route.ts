import { NextRequest, NextResponse } from 'next/server'
import { listMovements, createMovement } from '@/lib/stock'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as 'entrada' | 'saida' | null
  const movements = await listMovements(type ?? undefined)
  return NextResponse.json(movements)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const body = await req.json()
  const { item_id, type, quantity, lot, expiry_date, patient_id, patient_name, observation, nf_s3_key } = body
  if (!item_id || !type || !quantity) {
    return NextResponse.json({ error: 'item_id, type e quantity são obrigatórios' }, { status: 400 })
  }
  const movement = await createMovement({
    item_id: Number(item_id), type, quantity: Number(quantity),
    lot, expiry_date, patient_id: patient_id ? Number(patient_id) : null,
    patient_name, observation, nf_s3_key, created_by: createdBy,
  })
  return NextResponse.json(movement, { status: 201 })
}
