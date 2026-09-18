import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { idPacienteValido } from '@/lib/arquivo-paciente'
import { ehIntervaloValido, INTERVALOS } from '@/lib/em-tratamento'
import { definirIntervalo } from '@/lib/em-tratamento-db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const patientId = idPacienteValido(body?.patient_id)
  const intervalo = body?.intervalo
  if (!patientId || !ehIntervaloValido(intervalo)) {
    return NextResponse.json(
      { error: `patient_id e intervalo (${INTERVALOS.join(', ')} dias) são obrigatórios` },
      { status: 400 }
    )
  }

  const userName = session.user.name ?? 'desconhecido'
  const anterior = await definirIntervalo(patientId, intervalo)
  if (anterior === null) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })

  if (anterior !== intervalo) {
    await logAudit({
      userName,
      action: 'intervalo_aplicacao_alterado',
      entityType: 'patient',
      entityId: patientId,
      patientId,
      details: `de ${anterior} para ${intervalo} dias`,
    })
  }
  return NextResponse.json({ intervalo })
}
