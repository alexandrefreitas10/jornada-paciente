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
    model: 'claude-opus-4-8',
    max_tokens: 2048,
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
            text: `Esta imagem contém uma tabela de acompanhamento de paciente com colunas para semana, data, peso, circunferências e dose de medicação.

Extraia TODAS as linhas que tiverem pelo menos um dado preenchido e retorne APENAS um array JSON válido com os campos abaixo.

REGRAS IMPORTANTES:
- Os campos "weight", "abdominal_circumference", "waist_circumference" e "tirzepatide_dose" devem ser SEMPRE números decimais ou null — NUNCA texto.
- Se uma célula dessas colunas contiver texto (como "levou", "não", "sim", ou qualquer palavra), coloque null nesse campo.
- Somente extraia números para campos numéricos.
- O campo "date" pode ser string (ex: "15/05/26") ou null.
- O campo "week" deve ser inteiro (ex: 1 para "1ª SEMANA") ou null.

Formato esperado:
[
  {
    "week": 1,
    "date": "15/05/26",
    "weight": 54.8,
    "abdominal_circumference": 82.0,
    "waist_circumference": 75.5,
    "tirzepatide_dose": 4
  }
]

Retorne somente o array JSON, sem texto adicional, sem markdown, sem explicações.`,
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
