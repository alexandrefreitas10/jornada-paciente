import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createMeasurement, MeasurementInput } from '@/lib/measurements'

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
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = (photo.type || 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
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

  const text = (message.content[0] as { type: string; text: string }).text.trim()

  let extracted: unknown[]
  try {
    const parsed = JSON.parse(text)
    extracted = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return Response.json(
      { error: 'Não foi possível extrair os dados da foto. Tente uma imagem mais nítida ou adicione manualmente.' },
      { status: 422 }
    )
  }

  const created = await Promise.all(
    extracted.map((row) => {
      const r = row as Record<string, unknown>
      const input: MeasurementInput = {
        week: toNum(r.week),
        date: toStr(r.date),
        weight: toNum(r.weight),
        abdominal_circumference: toNum(r.abdominal_circumference),
        waist_circumference: toNum(r.waist_circumference),
        tirzepatide_dose: toNum(r.tirzepatide_dose),
      }
      return createMeasurement(Number(id), input)
    })
  )

  return Response.json(created, { status: 201 })
}
