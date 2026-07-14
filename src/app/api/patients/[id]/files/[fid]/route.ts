import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { softDeletePatientFile, getFileById, updateFileSummary } from '@/lib/patient-files'
import { ownsResource } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import { downloadFile } from '@/lib/s3'
import { generateExamSummary } from '@/lib/exam-summary'

export const maxDuration = 120

async function regenerateSummary(s3Key: string, originalName: string): Promise<string> {
  const buffer = await downloadFile(s3Key)
  const isPdf = originalName.toLowerCase().endsWith('.pdf')
  return generateExamSummary(buffer, isPdf ? 'application/pdf' : 'image/jpeg', originalName)
}

// Status dos resumos em geração (exames longos levam minutos — mais do que o
// limite de ~100s do proxy do Render, então a geração roda em segundo plano)
type JobStatus = { state: 'running' } | { state: 'error'; message: string }
const summaryJobs = new Map<number, JobStatus>()

// PATCH — dispara a geração em segundo plano e responde na hora
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

  if (summaryJobs.get(fileId)?.state === 'running') {
    return Response.json({ started: true, alreadyRunning: true }, { status: 202 })
  }

  summaryJobs.set(fileId, { state: 'running' })
  regenerateSummary(file.s3_key, file.original_name)
    .then(async summary => {
      await updateFileSummary(fileId, summary)
      summaryJobs.delete(fileId)
    })
    .catch(err => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Exam summary error:', message)
      summaryJobs.set(fileId, { state: 'error', message })
    })

  return Response.json({ started: true }, { status: 202 })
}

// GET — consulta o status da geração / o resumo pronto
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
  const job = summaryJobs.get(fileId)
  if (job?.state === 'running') {
    return Response.json({ status: 'running' })
  }
  if (job?.state === 'error') {
    summaryJobs.delete(fileId)
    return Response.json({ status: 'error', error: job.message })
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
