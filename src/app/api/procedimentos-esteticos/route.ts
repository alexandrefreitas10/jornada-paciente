import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { acharOuCriarProcedimento, listarProcedimentos } from '@/lib/procedimentos-esteticos-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarProcedimentos())
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const corpo = await req.json().catch(() => null)
  try {
    const r = await acharOuCriarProcedimento(corpo?.nome, session.user.name ?? null)
    return NextResponse.json(r)
  } catch (err) {
    // Só a mensagem do nosso próprio código vai para a tela; erro de banco
    // viraria 400 com nome de tabela e de constraint.
    if (err instanceof Error && err.message === 'Informe o nome do procedimento') {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('Erro ao cadastrar procedimento:', err)
    return NextResponse.json({ error: 'Não foi possível cadastrar. Tente de novo.' }, { status: 500 })
  }
}
