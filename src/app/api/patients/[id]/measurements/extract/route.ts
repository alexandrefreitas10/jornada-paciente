import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createMeasurement } from '@/lib/measurements'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    max_tokens: 512,
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
            text: `Esta imagem contém uma tabela de acompanhamento de paciente. Extraia os dados e retorne APENAS um objeto JSON válido com estes campos (use null quando o valor não estiver presente):
{
  "week": <número inteiro da semana ou null>,
  "date": <data como string ou null>,
  "weight": <peso em kg como número decimal ou null>,
  "abdominal_circumference": <circunferência do abdômen em cm como número decimal ou null>,
  "waist_circumference": <circunferência da cintura em cm como número decimal ou null>,
  "tirzepatide_dose": <dose de tirzepatida em mg como número decimal ou null>
}
Retorne somente o JSON, sem texto adicional, sem markdown.`,
          },
        ],
      },
    ],
  })

  const text = (message.content[0] as { type: string; text: string }).text.trim()

  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(text)
  } catch {
    return Response.json(
      { error: 'Não foi possível extrair os dados da foto. Tente uma imagem mais nítida ou adicione manualmente.' },
      { status: 422 }
    )
  }

  const measurement = await createMeasurement(Number(id), {
    week: typeof extracted.week === 'number' ? extracted.week : null,
    date: typeof extracted.date === 'string' ? extracted.date : null,
    weight: typeof extracted.weight === 'number' ? extracted.weight : null,
    abdominal_circumference:
      typeof extracted.abdominal_circumference === 'number'
        ? extracted.abdominal_circumference
        : null,
    waist_circumference:
      typeof extracted.waist_circumference === 'number'
        ? extracted.waist_circumference
        : null,
    tirzepatide_dose:
      typeof extracted.tirzepatide_dose === 'number' ? extracted.tirzepatide_dose : null,
  })

  return Response.json(measurement, { status: 201 })
}
