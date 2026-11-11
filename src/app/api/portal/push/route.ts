import { NextResponse } from 'next/server'
import { portalAuth } from '@/auth-portal'
import { apagarAssinatura, salvarAssinatura } from '@/lib/push-db'

/**
 * O paciente só pode inscrever o PRÓPRIO aparelho: o `patient_id` vem da
 * sessão, nunca do corpo do pedido. Aceitar do corpo deixaria qualquer um
 * inscrever-se para receber os avisos de outra pessoa.
 */
async function pacienteDaSessao(): Promise<number | null> {
  const session = await portalAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id = (session?.user as any)?.patient_id as number | undefined
  return typeof id === 'number' ? id : null
}

/** A chave pública, para o navegador montar a inscrição. */
export async function GET() {
  const chave = process.env.VAPID_PUBLIC_KEY
  if (!chave) return NextResponse.json({ error: 'push não configurado' }, { status: 503 })
  return NextResponse.json({ chave })
}

export async function POST(request: Request) {
  const patientId = await pacienteDaSessao()
  if (!patientId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const { endpoint, keys } = await request.json()
    if (typeof endpoint !== 'string' || !endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Inscrição incompleta' }, { status: 400 })
    }
    await salvarAssinatura(patientId, { endpoint, p256dh: keys.p256dh, auth: keys.auth })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar inscrição' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const patientId = await pacienteDaSessao()
  if (!patientId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const { endpoint } = await request.json()
    if (typeof endpoint !== 'string' || !endpoint) {
      return NextResponse.json({ error: 'Endereço ausente' }, { status: 400 })
    }
    await apagarAssinatura(endpoint)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao remover inscrição' }, { status: 500 })
  }
}
