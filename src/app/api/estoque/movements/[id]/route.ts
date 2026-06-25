import { NextRequest, NextResponse } from 'next/server'
import { updateMovement } from '@/lib/stock'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { quantity, lot, expiry_date, patient_name, observation } = body
  if (!quantity) return NextResponse.json({ error: 'Quantidade obrigatória' }, { status: 400 })
  const movement = await updateMovement(Number(id), { quantity: Number(quantity), lot, expiry_date, patient_name, observation })
  if (!movement) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(movement)
}
