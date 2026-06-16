import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createEvolutionSummary, listEvolutionSummaries, SummaryTopics } from '@/lib/evolution-summaries'
import { uploadFile } from '@/lib/s3'
import { randomUUID } from 'crypto'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const summaries = await listEvolutionSummaries(Number(id))
  return NextResponse.json(summaries)
}

const AUDIO_MIME_TO_FORMAT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'mp4',
  'audio/m4a': 'mp4',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
}

function audioFormat(mimeType: string, fileName: string): string {
  if (AUDIO_MIME_TO_FORMAT[mimeType]) return AUDIO_MIME_TO_FORMAT[mimeType]
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'm4a') return 'mp4'
  if (ext && AUDIO_MIME_TO_FORMAT[`audio/${ext}`]) return AUDIO_MIME_TO_FORMAT[`audio/${ext}`]
  return 'mp4'
}

async function transcribeAudio(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const format = audioFormat(mimeType, fileName)
  const base64 = buffer.toString('base64')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = await (client.messages.create as any)({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Transcreva o áudio abaixo na íntegra, em português brasileiro. Retorne APENAS o texto transcrito, sem comentários, sem introdução, sem formatação extra.',
          },
          {
            type: 'input_audio',
            format,
            data: base64,
          },
        ],
      },
    ],
  })

  return (msg.content[0] as { type: string; text: string }).text.trim()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const formData = await req.formData()
  let transcription = (formData.get('transcription') as string | null)?.trim() ?? ''
  const audio = formData.get('audio') as File | null

  // Upload de áudio para S3 (se enviado)
  let audioS3Key: string | null = null
  let audioName: string | null = null
  let audioBuffer: Buffer | null = null

  if (audio && audio.size > 0) {
    audioBuffer = Buffer.from(await audio.arrayBuffer())
    const ext = audio.name.split('.').pop() ?? 'mp4'
    audioS3Key = `patients/${id}/consultas/${randomUUID()}.${ext}`
    audioName = audio.name
    await uploadFile(audioS3Key, audioBuffer, audio.type || 'audio/mp4')
  }

  // Se não veio transcrição manual mas veio áudio, transcrever automaticamente
  if (!transcription && audioBuffer) {
    try {
      transcription = await transcribeAudio(audioBuffer, audio!.type || 'audio/mp4', audio!.name)
    } catch (err) {
      console.error('Erro na transcrição automática:', err)
      return NextResponse.json(
        { error: 'Não foi possível transcrever o áudio automaticamente. Cole a transcrição manualmente.' },
        { status: 422 }
      )
    }
  }

  if (!transcription) {
    return NextResponse.json({ error: 'Envie um áudio ou cole a transcrição para continuar.' }, { status: 400 })
  }

  // Extrai os 10 tópicos com Claude
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Você é um assistente médico especializado em nutrição e saúde. Analise a transcrição abaixo de uma consulta e extraia informações para cada um dos 10 tópicos. Seja objetivo e conciso. Se não houver informação sobre um tópico, responda "Não mencionado".

Retorne APENAS um JSON válido com exatamente estas chaves:
{
  "objetivos_principais": "...",
  "tratamentos_anteriores": "...",
  "queixas_principais": "...",
  "qualidade_sono": "...",
  "intestino": "...",
  "libido": "...",
  "padrao_alimentar": "...",
  "atividade_fisica": "...",
  "doencas_previas_cirurgias": "...",
  "medicacao_suplementos": "..."
}

TRANSCRIÇÃO:
${transcription}`,
      },
    ],
  })

  const rawText = (message.content[0] as { type: string; text: string }).text.trim()
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)

  let summary: SummaryTopics
  try {
    summary = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível processar a transcrição. Tente novamente.' },
      { status: 422 }
    )
  }

  const created = await createEvolutionSummary(
    Number(id),
    transcription,
    summary,
    audioS3Key,
    audioName,
  )

  return NextResponse.json(created, { status: 201 })
}
