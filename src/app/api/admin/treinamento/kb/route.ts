import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { readKb, writeKb, EMPTY_KB } from '@/lib/training/kb'

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 })
  }
  const kb = await readKb()
  return NextResponse.json({ kb: kb ?? EMPTY_KB, configured: kb !== null })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 })
  }
  const session = await auth()
  const userId = Number((session?.user as { id?: string })?.id)
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  try {
    const kb = await writeKb(body, userId)
    return NextResponse.json({ kb, configured: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Base de conhecimento inválida.' },
      { status: 400 }
    )
  }
}
