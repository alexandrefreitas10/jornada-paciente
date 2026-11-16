import { NextRequest } from 'next/server'
import { listPatientFiles, createPatientFile, updateFileSummary, setSummaryStatus, FileType } from '@/lib/patient-files'
import { temPrescricao } from '@/lib/agenda-db'
import { avisarPaciente } from '@/lib/push-envio'
import { avisoAgendaLiberada, devoAvisarAgendaLiberada } from '@/lib/avisos-do-portal'
import { uploadFile, getSignedDownloadUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'
import { generateExamSummary } from '@/lib/exam-summary'
import { logSystemError } from '@/lib/system-errors'
import { auth } from '@/auth'
import { tipoDeConteudo } from '@/lib/entrega-de-arquivo'

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

  // O tipo gravado vem dos BYTES, nunca de `file.type`: aquele campo é texto do
  // cliente e aceitava `image/svg+xml`, que a rota de download servia inline na
  // nossa origem — SVG carrega `<script>` e ele rodaria com a sessão de quem
  // abrisse o arquivo. Fora da lista conhecida grava `application/octet-stream`.
  //
  // Nada é RECUSADO aqui de propósito: docx, xlsx e qualquer outro documento
  // continuam entrando como sempre. Quem decide o que pode ser renderizado é a
  // rota que serve, pelos bytes — recusar no upload só quebraria fluxo do dono
  // sem fechar nada que a outra ponta já não feche.
  const tipoDosBytes = tipoDeConteudo(buffer)
  const mimeType = tipoDosBytes ?? 'application/octet-stream'

  try {
    await uploadFile(s3Key, buffer, mimeType)
  } catch (err) {
    console.error('S3 upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Erro S3: ${msg}` }, { status: 500 })
  }

  // Perguntado ANTES de gravar: depois do INSERT toda folha parece a primeira
  // ou nenhuma parece, dependendo de como se conta.
  const jaTinhaFolha = await temPrescricao(Number(id))

  const record = await createPatientFile(Number(id), fileType, s3Key, file.name, null, createdBy)
  const url = await getSignedDownloadUrl(s3Key)

  // A folha de prescrição é o que faz a aba Agenda aparecer no portal do
  // paciente — e até aqui ela aparecia EM SILÊNCIO, com alguém da recepção
  // avisando um a um pelo WhatsApp. `avisarPaciente` nunca lança: um aviso que
  // não saiu não pode derrubar o upload que o disparou.
  if (devoAvisarAgendaLiberada(fileType, jaTinhaFolha)) {
    await avisarPaciente(Number(id), avisoAgendaLiberada())
  }

  // Resumo de exame roda em segundo plano — exames longos levam minutos,
  // mais do que o limite de tempo do proxy para a requisição de upload.
  // O status fica no banco (pending/done/error), não em memória, para
  // sobreviver a restart do Render e nunca reportar "done" falso.
  if (fileType === 'exam') {
    await setSummaryStatus(record.id, 'pending')
    // Para a IA vale o tipo dos bytes quando conhecemos (ela recebe um PDF
    // renomeado como PDF, não como o que o cliente disse) e o declarado quando
    // não — assim docx e xlsx se comportam exatamente como antes desta mudança.
    generateExamSummary(buffer, tipoDosBytes ?? (file.type || mimeType), file.name)
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
