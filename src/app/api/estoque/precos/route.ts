import { NextResponse } from 'next/server'
import { canEstoqueSession } from '@/lib/authz'
import { listarPrecos } from '@/lib/precos-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await canEstoqueSession())) {
    return NextResponse.json({ error: 'Sem permissão de estoque' }, { status: 403 })
  }
  return NextResponse.json(await listarPrecos())
}
