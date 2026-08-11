import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import {
  findPortalUserByPatientId, gerarCodigoAcesso, revokePortalAccess,
} from '@/lib/patient-portal'
import { classificarCodigo } from '@/lib/portal-invite-code'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET — status atual do acesso do paciente
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await findPortalUserByPatientId(Number(id))
  if (!user) return NextResponse.json({ status: 'none' })

  if (user.invite_used_at) {
    return NextResponse.json({ status: 'active', email: user.email })
  }
  // Código ainda válido: a secretária pode reabrir o card e ver o MESMO código.
  // Sem isso, "perdi a mensagem" viraria sempre um código novo, e o paciente que
  // já tinha anotado o antigo ficaria sem entender por que parou de funcionar.
  if (user.invite_code && classificarCodigo(user) === 'valido') {
    return NextResponse.json({
      status: 'pending',
      email: user.email,
      code: user.invite_code,
      expiresAt: user.invite_expires_at,
    })
  }
  // Convite antigo por link, ainda pendente — segue válido pela rota antiga.
  if (user.invite_token) {
    return NextResponse.json({ status: 'pending_link', email: user.email, token: user.invite_token })
  }
  return NextResponse.json({ status: 'expired', email: user.email })
}

// POST — gera (ou regera) o código. Não recebe e-mail: quem escolhe é o paciente.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const { code, expiresAt } = await gerarCodigoAcesso(Number(id))
    // Regerar apaga a senha do paciente — precisa ficar registrado quem fez.
    const session = await auth()
    await logAudit({
      userName: session?.user?.name ?? 'desconhecido',
      action: 'portal.codigo.gerado',
      entityType: 'patient_user',
      patientId: Number(id),
      details: `Código de acesso ao portal gerado (válido até ${expiresAt}). Senha anterior, se havia, foi apagada.`,
    }).catch(() => {})
    return NextResponse.json({ ok: true, code, expiresAt })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE — revoga acesso (remove patient_users e limpa email)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await revokePortalAccess(Number(id))
  return NextResponse.json({ ok: true })
}
