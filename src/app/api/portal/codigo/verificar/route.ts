import { NextRequest, NextResponse } from 'next/server'
import { lerCodigoAcesso } from '@/lib/patient-portal'
import { assertNotLocked, registerFailure } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Um código de 6 caracteres é credencial de entrada: sem trava, dá pra testar
// milhares por minuto. A trava é por IP — ver comentário em rate-limit.ts.
function ipDe(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'desconhecido'
}

export async function POST(req: NextRequest) {
  const ip = ipDe(req)
  if ((await assertNotLocked('portal_code', ip)).blocked) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
      { status: 429 }
    )
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  const leitura = await lerCodigoAcesso(String(code ?? ''))
  // Só conta como tentativa de adivinhação o que É adivinhação. "Já usado"
  // fica de fora de propósito: é o caso mais comum na prática — o paciente
  // ativou, esqueceu, e reabre o código antigo. Contando esse, ele se trancaria
  // sozinho justamente quando está tentando entrar.
  if (leitura.estado === 'invalido' || leitura.estado === 'expirado') {
    await registerFailure('portal_code', ip)
  }

  return NextResponse.json(leitura)
}
