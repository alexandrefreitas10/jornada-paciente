import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logSystemError } from '@/lib/system-errors'

// O navegador avisa aqui quando NÃO conseguiu guardar uma montagem.
//
// Existe porque a recusa registrada no servidor só cobre a requisição que
// chegou lá. Se ela morre antes — rede caindo, aba fechada no meio do envio,
// tempo esgotado, resposta que nunca volta — o servidor não vê nada, e a
// montagem some sem deixar rastro: o dono já baixou a imagem, segue para o
// próximo paciente e só descobre a falta depois, sem saber qual foi nem por
// quê. Foi o que aconteceu com 6 montagens no primeiro dia de uso.
//
// É melhor-esforço de propósito: se esta chamada também falhar, quem chama
// engole o erro. Ela nunca pode atrapalhar o fluxo de quem está atendendo.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const corpo = await req.json().catch(() => null)
  const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo : 'desconhecido'

  // Só ids e códigos — nunca nome de paciente (regra do `logSystemError`).
  await logSystemError('fotos.montagem.falhou-no-navegador', motivo.slice(0, 300), {
    usuario: session.user.name ?? null,
    patientId: Number.isInteger(corpo?.patientId) ? corpo.patientId : null,
    pessoaId: Number.isInteger(corpo?.pessoaId) ? corpo.pessoaId : null,
    identidade: typeof corpo?.identidade === 'string' ? corpo.identidade : null,
    bytes: Number.isFinite(corpo?.bytes) ? corpo.bytes : null,
  })

  return NextResponse.json({ ok: true })
}
