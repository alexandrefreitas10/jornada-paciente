import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { idPacienteValido } from '@/lib/arquivo-paciente'
import { reativarPaciente } from '@/lib/patient-archive'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const patientId = idPacienteValido(id)
  if (!patientId) return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 })

  const userName = session.user.name ?? 'desconhecido'
  const reativado = await reativarPaciente(patientId, userName, 'pacientes_antigos')
  if (!reativado) {
    return NextResponse.json({ error: 'Paciente não encontrado ou não está arquivado' }, { status: 404 })
  }

  await logAudit({
    userName,
    action: 'paciente_reativado',
    entityType: 'patient',
    entityId: patientId,
    patientId,
  })
  return NextResponse.json({ ok: true })
}
