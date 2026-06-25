import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const mode = req.nextUrl.searchParams.get('mode') ?? 'nf'
  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mimeType = file.type || 'image/jpeg'
  const isPdf = mimeType === 'application/pdf'

  const isInventory = mode === 'inventory'
  const prompt = isInventory ? PROMPT_INVENTORY : PROMPT_NF
  // Use haiku for inventory (faster, avoids timeout on large PDFs)
  const model = isInventory ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'

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
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content }],
  })

  const text = (message.content[0] as { type: string; text: string }).text

  // Strip markdown code blocks if present
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
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

const PROMPT_INVENTORY = `Este é um documento de lista de contagem/inventário de estoque de medicamentos.

A tabela tem colunas: Código | Produto | Lote | Fabricação | Validade | Quantidade Sistema | Quantidade Físico

ATENÇÃO: cada produto aparece em duas linhas — a primeira linha tem só o nome (sem lote/validade/quantidade) e a segunda linha repete o nome e tem os dados reais. Ignore linhas sem lote e sem quantidade. Use APENAS as linhas que possuem Lote e Quantidade Sistema preenchidos.

Se um mesmo produto tiver múltiplos lotes, crie uma entrada separada para cada lote.

Retorne SOMENTE um JSON array válido, sem nenhum texto antes ou depois:
[
  {
    "name": "Nome completo do produto",
    "quantity": 10,
    "unit": "un",
    "lot": "ABC123",
    "expiry_date": "MM/YYYY"
  }
]

Regras:
- Use o valor da coluna "Quantidade Sistema" como quantity
- Formate a validade como MM/YYYY (ex: "02/2027")
- Se não houver lote ou quantidade, ignore a linha
- Unidade padrão: "un"
- Retorne APENAS o array JSON, sem explicações, sem markdown`
