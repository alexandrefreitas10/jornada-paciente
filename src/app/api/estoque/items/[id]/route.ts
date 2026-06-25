import { NextRequest, NextResponse } from 'next/server'
import { updateStockItem, getStockItem } from '@/lib/stock'
import sql from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getStockItem(Number(id))
  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, unit, notes } = await req.json()
  if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const item = await updateStockItem(Number(id), name, unit || 'un', notes ?? null)
  return NextResponse.json(item)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await sql`DELETE FROM stock_items WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
}
