import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { idPacienteValido, validarMotivo, MOTIVO_MIN, MOTIVO_MAX } from '@/lib/arquivo-paciente'
import { arquivarPaciente, type OrigemArquivamento } from '@/lib/patient-archive'

export const dynamic = 'force-dynamic'

const ORIGENS: readonly OrigemArquivamento[] = ['em_tratamento', 'card_paciente']

function ehOrigem(valor: unknown): valor is OrigemArquivamento {
  return typeof valor === 'string' && (ORIGENS as readonly string[]).includes(valor)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const patientId = idPacienteValido(id)
  if (!patientId) return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const motivo = validarMotivo(body?.motivo)
  if (!motivo) {
    return NextResponse.json(
      { error: `Escreva o motivo (de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres).` },
      { status: 400 }
    )
  }
  if (!ehOrigem(body?.origem)) {
    return NextResponse.json({ error: 'origem inválida' }, { status: 400 })
  }

  const userName = session.user.name ?? 'desconhecido'
  const arquivado = await arquivarPaciente(patientId, motivo, userName, body.origem)
  if (!arquivado) {
    return NextResponse.json({ error: 'Paciente não encontrado ou já arquivado' }, { status: 404 })
  }

  await logAudit({
    userName,
    action: 'paciente_arquivado',
    entityType: 'patient',
    entityId: patientId,
    patientId,
    details: motivo,
  })
  return NextResponse.json({ ok: true })
}
