import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

const PROMPT = `Você é um assistente médico que analisa tabelas de acompanhamento de pacientes e gera um relatório curto para prontuário.

A imagem contém uma tabela de evolução semanal do paciente (geralmente com medicação injetável como Tirzepatida, semanas de tratamento, datas, doses etc.).

Com base no que você vê na tabela, gere um relatório de prontuário no seguinte formato exato:

[Nome da medicação] - [dose] ([data do procedimento no formato DD/MM])
[Nª SEMANA DE X]
INJETÁVEIS REALIZADOS CONFORME PM, SEM INTERCORRÊNCIAS E SEGUE AOS CUIDADOS DA EQUIPE MULTI.

Regras:
- Identifique o nome da medicação e a dose da semana mais recente (última linha com dados)
- A data deve ser a data da aplicação mais recente na tabela, no formato DD/MM
- O número da semana deve ser a semana atual e o total de semanas previstas (ex: "3ª SEMANA DE 8")
- Use ordinal feminino para semana (ª)
- A terceira linha é SEMPRE fixa: "INJETÁVEIS REALIZADOS CONFORME PM, SEM INTERCORRÊNCIAS E SEGUE AOS CUIDADOS DA EQUIPE MULTI."
- Retorne APENAS as 3 linhas do relatório, sem explicações, sem cabeçalho, sem texto adicional`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params // ensure params are resolved

  const formData = await req.formData()
  const photo = formData.get('photo') as File | null
  if (!photo) return NextResponse.json({ error: 'Foto não enviada' }, { status: 400 })

  try {
    const buffer = Buffer.from(await photo.arrayBuffer())
    const jpeg = await sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer()
    const base64 = jpeg.toString('base64')

    const client = getClient()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const block = message.content[0] as { type: string; text?: string }
    if (block.type !== 'text' || !block.text) {
      return NextResponse.json({ error: 'Resposta inesperada da IA' }, { status: 500 })
    }

    return NextResponse.json({ report: block.text.trim() })
  } catch (err) {
    console.error('evolution-report error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
