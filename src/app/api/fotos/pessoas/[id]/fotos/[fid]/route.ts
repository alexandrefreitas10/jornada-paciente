import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { acharFotoAvulsa, softDeleteFotoAvulsa } from '@/lib/fotos-db'
import { idDeCaminho } from '@/lib/fotos-regras'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id, fid } = await params

  // `idDeCaminho` guarda a regra num lugar só (`fotos-regras.ts`): id não
  // numérico vira `NaN` e id acima do INTEGER do Postgres estoura dentro do
  // banco — os dois virando 500 onde a resposta tem de ser o MESMO 404 do id
  // inexistente, para quem sonda a API não distinguir um do outro.
  const pessoaId = idDeCaminho(id)
  const fotoId = idDeCaminho(fid)
  if (pessoaId == null || fotoId == null) {
    return NextResponse.json({ error: 'Foto não encontrada' }, { status: 404 })
  }

  // A foto tem de pertencer à pasta do caminho (anti-IDOR, como na rota de
  // arquivo do paciente).
  const foto = await acharFotoAvulsa(fotoId)
  if (!foto || foto.pessoa_id !== pessoaId) {
    return NextResponse.json({ error: 'Foto não encontrada' }, { status: 404 })
  }

  await softDeleteFotoAvulsa(foto.id)
  return NextResponse.json({ ok: true })
}
