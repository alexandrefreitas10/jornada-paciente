import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { acharOuCriarPessoa, listarPessoas } from '@/lib/fotos-db'
import { ErroDeRegra } from '@/lib/fotos-regras'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarPessoas())
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // O corpo pode ser qualquer coisa — inclusive o JSON literal `null`, que o
  // `catch` não pega porque o `json()` não falha. Por isso a leitura é por
  // `corpo?.nome`: `null`, número e texto solto caem em `undefined`, não em
  // TypeError fora do try.
  const corpo = (await req.json().catch(() => null)) as { nome?: unknown } | null
  const nome = typeof corpo?.nome === 'string' ? corpo.nome : ''
  try {
    // Acha-ou-cria: nome 100% idêntico cai na pasta que já existe.
    return NextResponse.json(await acharOuCriarPessoa(nome, session.user.name ?? null))
  } catch (err) {
    // Só mensagem escrita pelo NOSSO código vai para a tela. Erro de banco cru
    // viraria 400 com nome de tabela, de constraint e host/porta num
    // `ECONNREFUSED` — e chamaria incidente de infraestrutura de "culpa do
    // cliente". Ver `ErroDeRegra` em `fotos-regras.ts`.
    if (err instanceof ErroDeRegra) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('Erro ao criar pasta de fotos:', err)
    return NextResponse.json(
      { error: 'Não foi possível criar a pasta. Tente de novo.' },
      { status: 500 },
    )
  }
}
