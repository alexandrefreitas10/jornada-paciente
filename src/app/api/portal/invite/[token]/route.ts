import { NextRequest, NextResponse } from 'next/server'
import { findPortalUserByToken, activatePortalUser } from '@/lib/patient-portal'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

// GET /api/portal/invite/[token] — valida se token existe e é válido
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const user = await findPortalUserByToken(token)
  if (!user) {
    return NextResponse.json({ valid: false }, { status: 404 })
  }
  return NextResponse.json({ valid: true, email: user.email })
}

// POST /api/portal/invite/[token] — ativa conta com senha
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const { password } = await req.json()

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const ok = await activatePortalUser(token, password)
  if (!ok) {
    return NextResponse.json({ error: 'Link inválido ou já utilizado' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
