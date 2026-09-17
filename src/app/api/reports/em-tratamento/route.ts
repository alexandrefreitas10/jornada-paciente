import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listarEmTratamento } from '@/lib/em-tratamento-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarEmTratamento())
}
