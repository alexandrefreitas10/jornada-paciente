import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { softDeleteMontagem } from '@/lib/fotos-db'
import { idDeCaminho } from '@/lib/fotos-regras'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params

  // `idDeCaminho` guarda a regra num lugar só (`fotos-regras.ts`): id não
  // numérico vira `NaN` e id acima do INTEGER do Postgres estoura dentro do
  // banco — os dois virando 500 onde a resposta tem de ser o MESMO 404 do id
  // inexistente, para quem sonda a API não distinguir um do outro.
  const idNumero = idDeCaminho(id)
  if (idNumero == null) {
    return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  }

  // Soft-delete: o PNG continua no S3, como `patient_files` já faz.
  const apagou = await softDeleteMontagem(idNumero)
  if (!apagou) return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
