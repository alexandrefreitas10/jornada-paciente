import { NextRequest, NextResponse } from 'next/server'
import { getAuditLog, deleteAuditLog } from '@/lib/audit'
import { restoreMeasurement, MeasurementInput } from '@/lib/measurements'
import { createEvolutionSummary, SummaryTopics } from '@/lib/evolution-summaries'
import { createTextTerm, restorePatientTerm } from '@/lib/patient-terms'
import { restorePatient } from '@/lib/patients'
import { restorePatientFile } from '@/lib/patient-files'

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
  let skipped = 0 // medições não restauradas por já existir uma na mesma semana

  try {
    if (log.entity_type === 'measurement' && log.patient_id) {
      const restored = await restoreMeasurement(log.patient_id, data as MeasurementInput)
      if (!restored) skipped++
    } else if (log.entity_type === 'measurements' && log.patient_id) {
      const rows = (data as { rows: MeasurementInput[] }).rows
      const results = await Promise.all(rows.map(r => restoreMeasurement(log.patient_id!, r)))
      skipped = results.filter(r => r === null).length
    } else if (log.entity_type === 'evolution_summary' && log.patient_id) {
      const s = data as { transcription: string; summary: SummaryTopics; audio_name: string | null }
      await createEvolutionSummary(log.patient_id, s.transcription, s.summary, null, s.audio_name)
    } else if (log.entity_type === 'term' && log.patient_id) {
      const t = data as any
      if (t.sign_token) {
        // Restaurar termo com dados de assinatura
        await restorePatientTerm(log.patient_id, {
          title: t.title,
          content: t.content ?? '',
          file_s3_key: t.file_s3_key ?? null,
          file_name: t.file_name ?? null,
          file_mime: t.file_mime ?? null,
          fields: Array.isArray(t.fields) ? t.fields : [],
          filled_fields: t.filled_fields ?? {},
          signed_file_s3_key: t.signed_file_s3_key ?? null,
          status: t.status ?? 'draft',
          created_by: t.created_by ?? 'sistema',
          sign_token: t.sign_token,
          sent_at: t.sent_at ?? null,
          signed_at: t.signed_at ?? null,
          signer_name: t.signer_name ?? null,
          signature_data: t.signature_data ?? null,
        })
      } else {
        // Restaurar termo de texto simples
        await createTextTerm(log.patient_id, t.title, t.created_by ?? 'sistema', t.content ?? '')
      }
    } else if (log.entity_type === 'patient' && log.entity_id) {
      await restorePatient(Number(log.entity_id))
    } else if (log.entity_type === 'file' && log.entity_id) {
      await restorePatientFile(Number(log.entity_id))
    } else {
      return NextResponse.json({ error: 'Tipo não suportado para restauração' }, { status: 400 })
    }
  } catch (err) {
    // Loga o erro real para diagnóstico; o log de auditoria é PRESERVADO
    // (não chega no deleteAuditLog abaixo), então a restauração pode ser
    // tentada de novo sem perder os dados.
    console.error('[restore] falha ao restaurar', { logId, entityType: log.entity_type, error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Erro ao restaurar' }, { status: 500 })
  }

  // Remove o log de auditoria após restauração bem-sucedida
  await deleteAuditLog(Number(logId))

  return NextResponse.json({
    ok: true,
    ...(skipped > 0 ? { skipped, warning: `${skipped} medição(ões) não foram restauradas por já existir uma mais recente na mesma semana.` } : {}),
  })
}
