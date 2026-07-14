import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { softDeletePatientFile, getFileById, updateFileSummary } from '@/lib/patient-files'
import { logAudit } from '@/lib/audit'
import { downloadFile } from '@/lib/s3'
import { generateExamSummary } from '@/lib/exam-summary'

export const maxDuration = 120

async function regenerateSummary(s3Key: string, originalName: string): Promise<string> {
  const buffer = await downloadFile(s3Key)
  const isPdf = originalName.toLowerCase().endsWith('.pdf')
  return generateExamSummary(buffer, isPdf ? 'application/pdf' : 'image/jpeg', originalName)
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { fid } = await params
  const file = await getFileById(Number(fid))
  if (!file) return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  try {
    const summary = await regenerateSummary(file.s3_key, file.original_name)
    await updateFileSummary(Number(fid), summary)
    return Response.json({ summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  // Soft-delete: mantém o arquivo no S3 para que possa ser restaurado
  const fileRecord = await softDeletePatientFile(Number(fid))
  await logAudit({ userName, action: 'DELETE', entityType: 'file', entityId: fid, patientId: Number(id), details: fileRecord?.original_name, deletedData: fileRecord ?? undefined })
  return new Response(null, { status: 204 })
}
