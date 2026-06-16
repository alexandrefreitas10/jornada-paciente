import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI, { toFile } from 'openai'
import { createEvolutionSummary, listEvolutionSummaries, SummaryTopics } from '@/lib/evolution-summaries'
import { uploadFile } from '@/lib/s3'
import { randomUUID } from 'crypto'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const summaries = await listEvolutionSummaries(Number(id))
  return NextResponse.json(summaries)
}

async function transcribeAudio(buffer: Buffer, fileName: string): Promise<string> {
  // Whisper aceita m4a como mp4 — garante extensão correta
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'mp4'
  const safeName = ext === 'm4a' ? fileName.replace(/\.m4a$/i, '.mp4') : fileName
  const file = await toFile(buffer, safeName)
  const result = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  })
  return result.text.trim()
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

  // Transcrição automática via Whisper se não veio texto mas veio áudio
  if (!transcription && audioBuffer) {
    try {
      transcription = await transcribeAudio(audioBuffer, audio!.name)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Erro na transcrição automática:', msg)
      return NextResponse.json(
        { error: `Erro na transcrição: ${msg}` },
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
