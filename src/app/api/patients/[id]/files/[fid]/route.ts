import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { softDeletePatientFile, getFileById, updateFileSummary, setSummaryStatus } from '@/lib/patient-files'
import { ownsResource } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import { downloadFile } from '@/lib/s3'
import { generateExamSummary } from '@/lib/exam-summary'
import { logSystemError } from '@/lib/system-errors'

export const maxDuration = 120

async function regenerateSummary(s3Key: string, originalName: string): Promise<string> {
  const buffer = await downloadFile(s3Key)
  const isPdf = originalName.toLowerCase().endsWith('.pdf')
  return generateExamSummary(buffer, isPdf ? 'application/pdf' : 'image/jpeg', originalName)
}

// PATCH — dispara a geração em segundo plano e responde na hora.
// O status vive no banco (summary_status), não em memória, para sobreviver a
// restart do Render e nunca reportar "done" falso.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const fileId = Number(fid)
  const file = await getFileById(fileId)
  // Anti-IDOR: o arquivo tem que pertencer ao paciente do path
  if (!ownsResource(file, Number(id))) {
    return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  // Sempre permite (re)disparar: se um job morreu num restart do Render, o
  // status ficaria preso em 'pending' — retrigger destrava. Gerar duas vezes
  // só desperdiça uma chamada; a última a concluir vence.
  await setSummaryStatus(fileId, 'pending')
  regenerateSummary(file.s3_key, file.original_name)
    .then(summary => updateFileSummary(fileId, summary))
    .catch(err => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Exam summary error:', message)
      void logSystemError('ai_summary', 'falha ao regenerar resumo de exame', { fileId, patientId: Number(id), code: message })
      return setSummaryStatus(fileId, 'error', message).catch(() => {})
    })

  return Response.json({ started: true }, { status: 202 })
}

// GET — consulta o status da geração / o resumo pronto (tudo do banco)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const fileId = Number(fid)
  const file = await getFileById(fileId)
  // Anti-IDOR: o arquivo tem que pertencer ao paciente do path
  if (!ownsResource(file, Number(id))) {
    return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }
  if (file.summary_status === 'pending') {
    return Response.json({ status: 'running' })
  }
  if (file.summary_status === 'error') {
    return Response.json({ status: 'error', error: file.summary_error ?? 'Falha ao gerar resumo' })
  }
  return Response.json({ status: 'done', summary: file.summary })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  // Anti-IDOR: o arquivo tem que pertencer ao paciente do path
  const existing = await getFileById(Number(fid))
  if (!ownsResource(existing, Number(id))) {
    return new Response(null, { status: 404 })
  }
  // Soft-delete: mantém o arquivo no S3 para que possa ser restaurado
  const fileRecord = await softDeletePatientFile(Number(fid))
  await logAudit({ userName, action: 'DELETE', entityType: 'file', entityId: fid, patientId: Number(id), details: fileRecord?.original_name, deletedData: fileRecord ?? undefined })
  return new Response(null, { status: 204 })
}
