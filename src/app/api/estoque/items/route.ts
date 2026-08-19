import { NextRequest, NextResponse } from 'next/server'
import { listStockItems, createStockItem } from '@/lib/stock'
import { auth } from '@/auth'
import { canEstoqueSession } from '@/lib/authz'

export const dynamic = 'force-dynamic'

// ?zerados=1 é usado só pelo relatório "Repor Estoque". Sem o parâmetro o
// comportamento é o de sempre — todas as outras telas continuam sem os zerados.
export async function GET(req: NextRequest) {
  const incluirZerados = req.nextUrl.searchParams.get('zerados') === '1'
  const items = await listStockItems({ incluirZerados })
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
