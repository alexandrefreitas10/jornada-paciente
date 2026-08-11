import { NextRequest, NextResponse } from 'next/server'
import { ativarComCodigo, SENHA_MINIMA } from '@/lib/patient-portal'
import { assertNotLocked, clearAttempts, getClientIp, registerFailure } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MENSAGEM: Record<string, string> = {
  invalido: 'Código não encontrado. Confira as 6 letras e números.',
  usado: 'Este código já foi usado. Entre com seu e-mail e senha.',
  expirado: 'Este código expirou. Peça um novo na clínica.',
  email_em_uso: 'Este e-mail já está em uso. Use outro.',
  senha_curta: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`,
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if ((await assertNotLocked('portal_code', ip)).blocked) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
      { status: 429 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    code?: string; email?: string; password?: string
  }
  const email = String(body.email ?? '').trim()
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Informe um e-mail válido.', motivo: 'email_invalido' }, { status: 400 })
  }

  const r = await ativarComCodigo({
    code: String(body.code ?? ''),
    email,
    password: String(body.password ?? ''),
  })

  if (!r.ok) {
    // Erro de preenchimento não é tentativa de adivinhar código — não conta
    // para a trava, senão o paciente se tranca sozinho escolhendo senha curta.
    if (r.motivo === 'invalido' || r.motivo === 'expirado') await registerFailure('portal_code', ip)
    return NextResponse.json(
      { error: MENSAGEM[r.motivo] ?? 'Não foi possível ativar.', motivo: r.motivo },
      { status: 400 }
    )
  }

  await clearAttempts('portal_code', ip).catch(() => {})
  return NextResponse.json({ ok: true, email: r.email })
}
