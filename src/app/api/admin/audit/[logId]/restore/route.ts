import { NextRequest, NextResponse } from 'next/server'
import { getAuditLog, deleteAuditLog } from '@/lib/audit'
import { createMeasurement, MeasurementInput } from '@/lib/measurements'
import { createEvolutionSummary, SummaryTopics } from '@/lib/evolution-summaries'
import { createTextTerm } from '@/lib/patient-terms'
import { restorePatient } from '@/lib/patients'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  const { logId } = await params
  const log = await getAuditLog(Number(logId))

  if (!log) {
    return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })
  }
  if (!log.deleted_data) {
    return NextResponse.json({ error: 'Dados para restauração não disponíveis' }, { status: 400 })
  }

  const data = log.deleted_data

  try {
    if (log.entity_type === 'measurement' && log.patient_id) {
      await createMeasurement(log.patient_id, data as MeasurementInput)
    } else if (log.entity_type === 'measurements' && log.patient_id) {
      const rows = (data as { rows: MeasurementInput[] }).rows
      await Promise.all(rows.map(r => createMeasurement(log.patient_id!, r)))
    } else if (log.entity_type === 'evolution_summary' && log.patient_id) {
      const s = data as { transcription: string; summary: SummaryTopics; audio_name: string | null }
      await createEvolutionSummary(log.patient_id, s.transcription, s.summary, null, s.audio_name)
    } else if (log.entity_type === 'term' && log.patient_id) {
      const t = data as { title: string; content: string; file_s3_key: string | null; created_by: string }
      if (t.file_s3_key) {
        return NextResponse.json({ error: 'Termos com arquivo não podem ser restaurados (arquivo S3 apagado)' }, { status: 400 })
      }
      await createTextTerm(log.patient_id, t.title, t.created_by ?? 'sistema', t.content ?? '')
    } else if (log.entity_type === 'patient' && log.entity_id) {
      await restorePatient(Number(log.entity_id))
    } else if (log.entity_type === 'file') {
      return NextResponse.json({ error: 'Arquivos físicos não podem ser restaurados' }, { status: 400 })
    } else {
      return NextResponse.json({ error: 'Tipo não suportado para restauração' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Erro ao restaurar' }, { status: 500 })
  }

  // Remove o log de auditoria após restauração bem-sucedida
  await deleteAuditLog(Number(logId))

  return NextResponse.json({ ok: true })
}
