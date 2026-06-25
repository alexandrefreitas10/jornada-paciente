import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const mode = req.nextUrl.searchParams.get('mode') ?? 'nf'
  const prompt = mode === 'inventory' ? PROMPT_INVENTORY : PROMPT_NF

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mimeType = file.type || 'image/jpeg'
  const isPdf = mimeType === 'application/pdf'

  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as Anthropic.DocumentBlockParam,
        { type: 'text', text: prompt },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: prompt },
      ]

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content }],
  })

  const text = (message.content[0] as { type: string; text: string }).text

  // Parse JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return NextResponse.json({ items: [], raw: text })

  try {
    const items = JSON.parse(jsonMatch[0])
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [], raw: text })
  }
}

const PROMPT_NF = `Esta é uma nota fiscal ou documento de compra de medicamentos/insumos médicos.
Identifique cada item e retorne APENAS um JSON array com o seguinte formato (sem texto extra, somente o array):
[
  {
    "name": "Nome do medicamento ou insumo",
    "quantity": 10,
    "unit": "caixas",
    "lot": "ABC123",
    "expiry_date": "12/2026"
  }
]
Se não encontrar lote ou validade, use null. Seja objetivo e liste todos os itens da nota.`

const PROMPT_INVENTORY = `Este é um documento ou planilha de estoque atual de medicamentos/insumos médicos.
Identifique cada item em estoque e retorne APENAS um JSON array com o seguinte formato (sem texto extra, somente o array):
[
  {
    "name": "Nome do medicamento ou insumo",
    "quantity": 10,
    "unit": "un",
    "lot": "ABC123",
    "expiry_date": "12/2026"
  }
]
Extraia o nome, a quantidade atual em estoque, a unidade de medida, o lote e a validade de cada item.
Se não encontrar lote ou validade para algum item, use null. Liste todos os itens presentes no documento.`
