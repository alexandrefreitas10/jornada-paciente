import { NextRequest, NextResponse } from 'next/server'
import { adjustStockQuantity, getStockItem } from '@/lib/stock'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const { target_quantity, lot, expiry_date } = await req.json()
  if (target_quantity === undefined || target_quantity === null) {
    return NextResponse.json({ error: 'target_quantity obrigatório' }, { status: 400 })
  }
  const item = await getStockItem(Number(id))
  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  await adjustStockQuantity(Number(id), item.quantity, Number(target_quantity), lot ?? null, expiry_date ?? null, createdBy)
  const updated = await getStockItem(Number(id))
  return NextResponse.json(updated)
}
