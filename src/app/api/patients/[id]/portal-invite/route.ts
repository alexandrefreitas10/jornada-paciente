import { NextRequest, NextResponse } from 'next/server'
import { createPortalInvite, findPortalUserByPatientId, revokePortalAccess } from '@/lib/patient-portal'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET — retorna status atual do acesso do paciente
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await findPortalUserByPatientId(Number(id))

  if (!user) return NextResponse.json({ status: 'none' })

  if (user.invite_used_at) {
    return NextResponse.json({ status: 'active', email: user.email })
  }

  if (user.invite_token) {
    return NextResponse.json({ status: 'pending', email: user.email, token: user.invite_token })
  }

  return NextResponse.json({ status: 'none' })
}

// POST — gera novo convite (cria patient_users ou sobrescreve token)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { email } = await req.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  }

  try {
    const token = await createPortalInvite(Number(id), email)
    // Atrás de proxy (Railway), nextUrl.origin retorna o host interno (localhost:PORT).
    // Usa os headers de forwarded para montar o domínio público real.
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
    const link = `${proto}://${host}/portal/ativar/${token}`
    return NextResponse.json({ ok: true, token, link })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Este e-mail já está em uso por outro paciente' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE — revoga acesso (remove patient_users e limpa email)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await revokePortalAccess(Number(id))
  return NextResponse.json({ ok: true })
}
