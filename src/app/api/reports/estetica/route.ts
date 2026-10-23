import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listarSessoesEstetica } from '@/lib/estetica-relatorio-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarSessoesEstetica())
}
