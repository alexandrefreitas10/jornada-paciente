import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { uploadFile } from '@/lib/s3'

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

  // Upload to S3 for audit trail
  let s3Key: string | null = null
  let originalFilename: string | null = null
  try {
    originalFilename = file.name || `${mode}-${Date.now()}.${isPdf ? 'pdf' : 'jpg'}`
    s3Key = `stock-entries/${mode}/${Date.now()}-${originalFilename}`
    await uploadFile(s3Key, buffer, mimeType)
  } catch {
    // Non-fatal: continue even if S3 upload fails
    s3Key = null
  }

  const isInventory = mode === 'inventory'
  const prompt = isInventory ? PROMPT_INVENTORY : PROMPT_NF
  // Use haiku for inventory (faster, avoids timeout on large PDFs)
  const model = isInventory ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'
  const maxTokens = isInventory ? 16000 : 8192

  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as Anthropic.DocumentBlockParam,
        { type: 'text', text: prompt },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: prompt },
      ]

  try {
    const message = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    })

    const block = message.content[0] as { type: string; text?: string }
    if (block.type !== 'text' || !block.text) {
      return NextResponse.json({ items: [], parseError: `Unexpected block type: ${block.type}` })
    }

    const text = block.text

    if (message.stop_reason === 'max_tokens') {
      return NextResponse.json({ items: [], parseError: 'Resposta truncada (max_tokens). O inventário tem muitos itens. Tente dividir o PDF em partes menores.' })
    }

    const startIdx = text.indexOf('[')
    const endIdx = text.lastIndexOf(']')

    // Não devolve o conteúdo do documento (raw) ao cliente — evita vazar
    // dados da nota/paciente em logs/histórico. Só o motivo do erro.
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return NextResponse.json({ items: [], parseError: 'Não foi possível ler os itens do documento.' })
    }

    const jsonStr = text.slice(startIdx, endIdx + 1)

    try {
      const items = JSON.parse(jsonStr)
      if (!Array.isArray(items)) {
        return NextResponse.json({ items: [], parseError: 'Formato inesperado ao ler o documento.' })
      }
      return NextResponse.json({ items, s3Key, originalFilename })
    } catch {
      return NextResponse.json({ items: [], parseError: 'Não foi possível interpretar os itens do documento.' })
    }
  } catch (err) {
    return NextResponse.json({ items: [], parseError: `API error: ${String(err)}` })
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

Retorne SOMENTE um JSON array compacto (sem indentação, tudo em uma linha), sem nenhum texto antes ou depois:
[{"name":"Nome do produto","quantity":10,"unit":"un","lot":"ABC123","expiry_date":"MM/YYYY"},...]

Regras:
- Use o valor da coluna "Quantidade Sistema" como quantity (número inteiro)
- Formate a validade como MM/YYYY (ex: "02/2027")
- Se não houver lote ou quantidade, ignore a linha
- Unidade padrão: "un"
- JSON COMPACTO: sem espaços desnecessários, sem quebras de linha, sem indentação
- Retorne APENAS o array JSON, sem explicações, sem markdown, sem blocos de código, sem backticks`
