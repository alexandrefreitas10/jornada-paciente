import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// Chama o Claude com um arquivo (PDF ou imagem) + um prompt e devolve o texto.
async function askAboutFile(buffer: Buffer, mimeType: string, fileName: string, prompt: string): Promise<string> {
  const base64 = buffer.toString('base64')
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as Anthropic.DocumentBlockParam,
        { type: 'text', text: prompt },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: prompt },
      ]
  const msg = await getClient().messages
    .stream({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content }] })
    .finalMessage()
  const block = msg.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
  return block?.text ?? ''
}

// Extrai o primeiro objeto/array JSON de um texto (o modelo às vezes envolve em ```).
function parseJson<T>(text: string): T | null {
  try {
    const start = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i < 0 ? Infinity : i }))
    if (!isFinite(start)) return null
    const openChar = text[start]
    const closeChar = openChar === '{' ? '}' : ']'
    const end = text.lastIndexOf(closeChar)
    if (end < 0) return null
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch { return null }
}

export interface BioMetrics {
  data: string | null
  peso: string | null
  gordura: string | null
  massa_magra: string | null
}

const BIO_PROMPT = `Este é um exame de BIOIMPEDÂNCIA (ex: InBody). Extraia APENAS estes 4 dados e responda SÓ com um JSON, sem texto extra:
{"data":"data do exame (dd/mm/aaaa) ou null","peso":"peso em kg com unidade, ex '82,4 kg' ou null","gordura":"percentual de gordura corporal, ex '24,1%' ou null","massa_magra":"percentual OU massa de músculo/massa magra, ex '48,6 kg' ou '55,2%' ou null"}
Use exatamente os valores do documento. Se algum não existir, use null. Responda somente o JSON.`

export async function extractBioMetrics(buffer: Buffer, mimeType: string, fileName: string): Promise<BioMetrics | null> {
  const text = await askAboutFile(buffer, mimeType, fileName, BIO_PROMPT)
  return parseJson<BioMetrics>(text)
}

export interface DietMeal { nome: string; itens: string }
export interface DietPlan { meals: DietMeal[] }

const DIET_PROMPT = `Este é um PLANO ALIMENTAR (dieta). Extraia as refeições e responda SÓ com um JSON, sem texto extra:
{"meals":[{"nome":"nome da refeição (ex: Café da manhã, Lanche, Almoço, Jantar, Ceia)","itens":"o que comer nessa refeição, em uma frase corrida ou itens separados por ' · '"}]}
Mantenha a ordem do documento. Não invente refeições que não existam. Responda somente o JSON.`

export async function extractDietPlan(buffer: Buffer, mimeType: string, fileName: string): Promise<DietPlan | null> {
  const text = await askAboutFile(buffer, mimeType, fileName, DIET_PROMPT)
  const parsed = parseJson<DietPlan>(text)
  if (parsed && Array.isArray(parsed.meals)) return parsed
  return null
}
