import { NextRequest } from 'next/server'
import { listPatientFiles, createPatientFile, updateFileSummary, setSummaryStatus, FileType } from '@/lib/patient-files'
import { uploadFile, getSignedDownloadUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'
import { generateExamSummary } from '@/lib/exam-summary'
import { logSystemError } from '@/lib/system-errors'
import { auth } from '@/auth'

export const maxDuration = 120

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const fileType = req.nextUrl.searchParams.get('type') as FileType
  const files = await listPatientFiles(Number(id), fileType)
  const withUrls = await Promise.all(
    files.map(async (f) => ({
      ...f,
      url: await getSignedDownloadUrl(f.s3_key),
    }))
  )
  return Response.json(withUrls)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  const createdBy = session?.user?.name ?? null

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const fileType = formData.get('type') as FileType | null

  if (!file || !fileType) {
    return Response.json({ error: 'Arquivo ou tipo não enviado' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const s3Key = `patients/${id}/${fileType}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'application/octet-stream'

  try {
    await uploadFile(s3Key, buffer, mimeType)
  } catch (err) {
    console.error('S3 upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Erro S3: ${msg}` }, { status: 500 })
  }

  const record = await createPatientFile(Number(id), fileType, s3Key, file.name, null, createdBy)
  const url = await getSignedDownloadUrl(s3Key)

  // Resumo de exame roda em segundo plano — exames longos levam minutos,
  // mais do que o limite de tempo do proxy para a requisição de upload.
  // O status fica no banco (pending/done/error), não em memória, para
  // sobreviver a restart do Render e nunca reportar "done" falso.
  if (fileType === 'exam') {
    await setSummaryStatus(record.id, 'pending')
    generateExamSummary(buffer, mimeType, file.name)
      .then(summary => updateFileSummary(record.id, summary))
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Exam summary error:', err)
        void logSystemError('ai_summary', 'falha ao gerar resumo de exame', { fileId: record.id, patientId: Number(id), code: message })
        return setSummaryStatus(record.id, 'error', message).catch(() => {})
      })
  }

  return Response.json({ ...record, url }, { status: 201 })
}
