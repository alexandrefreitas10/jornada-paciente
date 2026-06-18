import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { createMeasurement, listMeasurements, MeasurementInput } from '@/lib/measurements'
import { uploadFile, deleteFile } from '@/lib/s3'
import { createPatientFile, listPatientFiles, deletePatientFile } from '@/lib/patient-files'
import { randomUUID } from 'crypto'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? null : n
  }
  return null
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const formData = await req.formData()
  const photo = formData.get('photo') as File | null

  if (!photo) {
    return Response.json({ error: 'Foto não enviada' }, { status: 400 })
  }

  const arrayBuffer = await photo.arrayBuffer()
  const rawBuffer = Buffer.from(arrayBuffer)
  // Auto-rotate based on EXIF orientation (fixes sideways mobile camera photos)
  const buffer = await sharp(rawBuffer).rotate().toBuffer()
  const base64 = buffer.toString('base64')
  const mediaType = (photo.type || 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Esta imagem contém uma tabela de acompanhamento de paciente com várias semanas. Extraia TODAS as linhas que tiverem pelo menos um dado preenchido e retorne APENAS um array JSON válido. Cada item do array deve ter estes campos (use null quando não estiver presente):
[
  {
    "week": <número inteiro da semana, ex: 1 para "1ª SEMANA">,
    "date": <data como string, ex: "15/05/26">,
    "weight": <peso em kg como número decimal, ex: 54.8>,
    "abdominal_circumference": <circunferência do abdômen em cm como número decimal>,
    "waist_circumference": <circunferência da cintura em cm como número decimal>,
    "tirzepatide_dose": <dose em mg como número decimal, ex: 4>
  }
]
Ignore linhas completamente vazias. Retorne somente o array JSON, sem texto adicional, sem markdown.`,
          },
        ],
      },
    ],
  })

  const rawText = (message.content[0] as { type: string; text: string }).text.trim()

  // Remove markdown code blocks if present
  const text = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  // Try to find a JSON array or object in the response
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)

  let extracted: unknown[]
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    extracted = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    console.error('Claude response could not be parsed as JSON:', rawText)
    return Response.json(
      { error: 'Não foi possível extrair os dados da foto. Tente uma imagem mais nítida ou adicione manualmente.' },
      { status: 422 }
    )
  }

  // Busca semanas já existentes para evitar duplicação
  const existing = await listMeasurements(Number(id))
  const existingWeeks = new Set(existing.map(m => m.week).filter(w => w !== null))

  const newRows = extracted
    .map((row) => {
      const r = row as Record<string, unknown>
      return {
        week: toNum(r.week),
        date: toStr(r.date),
        weight: toNum(r.weight),
        abdominal_circumference: toNum(r.abdominal_circumference),
        waist_circumference: toNum(r.waist_circumference),
        tirzepatide_dose: toNum(r.tirzepatide_dose),
      } as MeasurementInput
    })
    .filter(input => input.week == null || !existingWeeks.has(input.week))

  const created = await Promise.all(
    newRows.map(input => createMeasurement(Number(id), input))
  )

  // Substitui a foto de tabela anterior pela nova (mantém só a mais recente)
  try {
    const previous = await listPatientFiles(Number(id), 'evolution')
    await Promise.all(previous.map(async (f) => {
      await deleteFile(f.s3_key).catch(() => {})
      await deletePatientFile(f.id)
    }))
    const ext = photo.name.split('.').pop() ?? 'jpg'
    const s3Key = `patients/${id}/evolution/${randomUUID()}.${ext}`
    await uploadFile(s3Key, buffer, mediaType)
    await createPatientFile(Number(id), 'evolution', s3Key, photo.name)
  } catch (err) {
    console.error('Erro ao salvar foto de evolução no S3:', err)
  }

  return Response.json(created, { status: 201 })
}
