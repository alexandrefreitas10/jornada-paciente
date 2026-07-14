import { NextRequest, NextResponse } from 'next/server'
import { listStockItems, createStockItem } from '@/lib/stock'
import { auth } from '@/auth'
import { canEstoqueSession } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export async function GET() {
  const items = await listStockItems()
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const { name, unit, notes } = await req.json()
  if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const item = await createStockItem(name, unit || 'un', notes ?? null, createdBy)
  return NextResponse.json(item, { status: 201 })
}
