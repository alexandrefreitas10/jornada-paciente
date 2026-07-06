import { NextRequest } from 'next/server'
import { listPatientFiles, createPatientFile, FileType } from '@/lib/patient-files'
import { uploadFile, getSignedDownloadUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/auth'

export const maxDuration = 120

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

async function generateExamSummary(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const base64 = buffer.toString('base64')
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as Anthropic.DocumentBlockParam,
        {
          type: 'text',
          text: 'Este é um exame médico. Extraia e liste de forma clara e organizada APENAS os resultados encontrados, com os valores e as referências normais quando disponíveis. Seja objetivo e use linguagem simples. Responda em português.',
        },
      ]
    : [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        },
        {
          type: 'text',
          text: 'Esta é a imagem de um exame médico. Extraia e liste de forma clara e organizada APENAS os resultados encontrados, com os valores e as referências normais quando disponíveis. Seja objetivo e use linguagem simples. Responda em português.',
        },
      ]

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content }],
  })

  return (message.content[0] as { type: string; text: string }).text
}

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

  let summary: string | null = null
  if (fileType === 'exam') {
    try {
      summary = await generateExamSummary(buffer, mimeType, file.name)
    } catch (err) {
      console.error('Exam summary error:', err)
    }
  }

  const record = await createPatientFile(Number(id), fileType, s3Key, file.name, summary, createdBy)
  const url = await getSignedDownloadUrl(s3Key)

  return Response.json({ ...record, url }, { status: 201 })
}
