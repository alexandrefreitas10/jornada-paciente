import { NextRequest, NextResponse } from 'next/server'
import { listMovements, createMovement, InsufficientStockError } from '@/lib/stock'
import { auth } from '@/auth'
import { canEstoqueSession } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as 'entrada' | 'saida' | null
  const movements = await listMovements(type ?? undefined)
  return NextResponse.json(movements)
}

export async function POST(req: NextRequest) {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const body = await req.json()
  const { item_id, type, quantity, lot, expiry_date, patient_id, patient_name, observation, nf_s3_key, measurement_id, idempotency_key } = body
  if (!item_id || !type || !quantity) {
    return NextResponse.json({ error: 'item_id, type e quantity são obrigatórios' }, { status: 400 })
  }
  try {
    const movement = await createMovement({
      item_id: Number(item_id), type, quantity: Number(quantity),
      lot, expiry_date, patient_id: patient_id ? Number(patient_id) : null,
      patient_name, observation, nf_s3_key, created_by: createdBy,
      measurement_id: measurement_id ? Number(measurement_id) : null,
      idempotency_key: idempotency_key ?? null,
    })
    return NextResponse.json(movement, { status: 201 })
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `Saldo insuficiente: disponível ${err.available}, solicitado ${err.requested}` },
        { status: 409 }
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
