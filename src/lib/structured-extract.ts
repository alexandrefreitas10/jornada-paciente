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

export interface BioRaw {
  data: string | null
  peso: string | null           // "97,9 kg"
  gordura_pct: string | null    // só o número do PGC, ex "14,4"
  massa_muscular: string | null // Massa Muscular Esquelética, ex "48,6 kg"
  massa_magra: string | null    // Massa Livre de Gordura, ex "83,8 kg"
}

const BIO_PROMPT = `Este é um exame de BIOIMPEDÂNCIA (ex: InBody). Extraia SOMENTE estes campos e responda SÓ com um JSON, sem texto extra:
{"data":"data do exame (campo 'Data / Hora'), formato dd/mm/aaaa, ou null","peso":"o PESO CORPORAL em kg com unidade (campo 'Peso'), ex '97,9 kg', ou null","gordura_pct":"o PERCENTUAL DE GORDURA CORPORAL (campo 'PGC'/'Percentual de Gordura'), SOMENTE o número, ex '14,4', ou null","massa_muscular":"a MASSA MUSCULAR ESQUELÉTICA com unidade (campo 'Massa Muscular Esquelética'), ex '48,6 kg', ou null","massa_magra":"a MASSA LIVRE DE GORDURA com unidade (campo 'Massa Livre de Gordura'), ex '83,8 kg', ou null"}
Não confunda os dois: 'Massa Muscular Esquelética' e 'Massa Livre de Gordura' são valores DIFERENTES e devem ir em campos separados. Responda somente o JSON.`

export async function extractBioRaw(buffer: Buffer, mimeType: string, fileName: string): Promise<BioRaw | null> {
  const text = await askAboutFile(buffer, mimeType, fileName, BIO_PROMPT)
  return parseJson<BioRaw>(text)
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
