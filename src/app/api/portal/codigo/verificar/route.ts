import { NextRequest, NextResponse } from 'next/server'
import { lerCodigoAcesso } from '@/lib/patient-portal'
import { assertNotLocked, getClientIp, registerFailure } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Um código de 6 caracteres é credencial de entrada: sem trava, dá pra testar
// milhares por minuto. A trava é por IP — ver comentário em rate-limit.ts.

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
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
  // sozinho justamente quando está tentando entrar. Malformado (erro de
  // digitação — tamanho errado ou letra fora do alfabeto) também fica de
  // fora: nem chegou a consultar o banco, então não é uma tentativa real.
  if ((leitura.estado === 'invalido' && !leitura.malformado) || leitura.estado === 'expirado') {
    await registerFailure('portal_code', ip)
  }

  return NextResponse.json(leitura)
}
