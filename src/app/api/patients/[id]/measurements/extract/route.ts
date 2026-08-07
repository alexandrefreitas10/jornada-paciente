import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { createMeasurement, deleteAllMeasurements, MeasurementInput } from '@/lib/measurements'
import { uploadFile, deleteFile } from '@/lib/s3'
import { createPatientFile, listPatientFiles, deletePatientFile } from '@/lib/patient-files'
import { logSystemError } from '@/lib/system-errors'
import { randomUUID } from 'crypto'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// timeout explícito + retries: a API pode devolver 429 (limite) ou 529 (sobrecarga)
// transitórios quando várias fotos são enviadas em sequência. Sem isso, a falha
// subia como exceção e o Next devolvia 500 com corpo VAZIO — o cliente fazia
// res.json() e estourava "Unexpected end of JSON input".
function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3, timeout: 60_000 })
}

// Extrai só a frase de erro da API — err.message vem com o JSON inteiro.
function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = (err as { error?: { error?: { message?: string } } }).error
  return body?.error?.message ?? err.message
}

// Traduz a falha para uma mensagem que a equipe entende (nunca corpo vazio).
function friendlyError(err: unknown): { message: string; code: string } {
  if (err instanceof Anthropic.APIError) {
    const status = err.status
    if (status === 429) return { message: 'A leitura por IA está com muitas requisições agora. Espere alguns segundos e toque em enviar de novo.', code: `anthropic_${status}` }
    if (status === 529 || (status !== undefined && status >= 500)) return { message: 'O serviço de leitura por IA está sobrecarregado no momento. Tente novamente em instantes.', code: `anthropic_${status}` }
    if (status === 413) return { message: 'A foto ficou grande demais para processar. Recorte só a tabela e tente de novo.', code: 'anthropic_413' }
    if (status === 400) {
      const apiMsg = apiMessage(err)
      // Saldo da conta de IA zerado: nada a ver com a foto — a equipe precisa
      // saber que é cobrança, não tentar de novo com outra imagem.
      if (/credit balance is too low|insufficient credit|billing/i.test(apiMsg)) {
        return {
          message: 'Os créditos da IA acabaram — por isso a leitura automática parou. É preciso recarregar em console.anthropic.com (Plans & Billing). Enquanto isso, use "+ Adicionar manualmente" para lançar as medições.',
          code: 'anthropic_no_credits',
        }
      }
      // Outro 400: mostra o motivo real da API (é sobre o arquivo, não o paciente)
      return { message: `A leitura por IA recusou essa imagem: ${apiMsg}`, code: 'anthropic_400' }
    }
    return { message: `Erro na leitura por IA (${status}). Tente novamente ou adicione manualmente.`, code: `anthropic_${status}` }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { message: 'Não foi possível falar com o serviço de leitura por IA (conexão). Tente novamente.', code: 'anthropic_conn' }
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (/unsupported image|Input buffer|sharp/i.test(msg)) {
    return { message: 'Não foi possível ler esse formato de imagem. Tire a foto novamente (JPG ou PNG).', code: 'image_decode' }
  }
  return { message: 'Erro inesperado ao processar a foto. Tente novamente ou adicione manualmente.', code: 'unknown' }
}

// A API aceita no máximo ~5MB por imagem já em base64 (base64 infla ~33%), então
// o binário precisa ficar abaixo de ~3,5MB. Reduz a nitidez em passos só até
// caber — números de tabela manuscrita precisam de resolução, então começa alto.
const MAX_IMAGE_BYTES = 3_500_000
const STEPS: { maxPx: number; quality: number }[] = [
  { maxPx: 2200, quality: 88 },
  { maxPx: 2000, quality: 80 },
  { maxPx: 1600, quality: 75 },
  { maxPx: 1300, quality: 70 },
]

async function prepareImage(raw: Buffer): Promise<Buffer> {
  let last: Buffer | null = null
  for (const { maxPx, quality } of STEPS) {
    // .rotate() aplica a orientação EXIF (foto de celular deitada)
    last = await sharp(raw)
      .rotate()
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    if (last.length <= MAX_IMAGE_BYTES) return last
  }
  return last!
}

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
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    return await handleExtract(req, ctx)
  } catch (err) {
    // Rede de segurança: qualquer falha vira JSON legível. Sem isso o Next
    // devolvia 500 com corpo vazio e o cliente quebrava no res.json().
    const { message, code } = friendlyError(err)
    const detail = err instanceof Error ? err.message : String(err)
    console.error('extract measurements error:', err)
    void logSystemError('ai_extract', 'falha ao extrair medições da foto', { code, detail })
    return Response.json({ error: message, code }, { status: 502 })
  }
}

async function handleExtract(
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
  // Normaliza a imagem antes de enviar: a API rejeita (400) imagens acima de
  // ~5MB em base64, e o recorte no celular gera JPEG 2400px q0.92 que passa
  // disso em fotos detalhadas — era a causa do "erro na leitura por IA (400)".
  // Também força JPEG, então HEIC/PNG/webp deixam de quebrar o media_type.
  const buffer = await prepareImage(rawBuffer)
  const base64 = buffer.toString('base64')
  const mediaType = 'image/jpeg' as const

  const message = await getClient().messages.create({
    // Haiku 4.5: ~1/5 do custo do Opus e suficiente para ler números de tabela.
    // Se a precisão cair em tabelas manuscritas, voltar para 'claude-opus-4-8'.
    model: 'claude-haiku-4-5',
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
    // Não loga o rawText: pode conter dados do paciente (PHI)
    console.error('Claude response could not be parsed as JSON (extract measurements)')
    return Response.json(
      { error: 'Não foi possível extrair os dados da foto. Tente uma imagem mais nítida ou adicione manualmente.' },
      { status: 422 }
    )
  }

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
    // Descarta linhas totalmente vazias (a IA às vezes devolve o cabeçalho)
    .filter(r => r.week != null || r.date != null || r.weight != null ||
      r.abdominal_circumference != null || r.waist_circumference != null || r.tirzepatide_dose != null)

  // Só apaga a tabela existente se a leitura trouxe algo — senão uma extração
  // vazia zerava todas as medições do paciente.
  if (newRows.length === 0) {
    return Response.json(
      { error: 'Não foi possível ler nenhuma linha da tabela nessa foto. As medições atuais foram mantidas. Tente uma foto mais nítida ou adicione manualmente.', code: 'empty_extract' },
      { status: 422 }
    )
  }

  // Nova foto substitui toda a tabela — apaga medições antigas e insere as novas
  await deleteAllMeasurements(Number(id))

  const created = await Promise.all(
    newRows.map(input => createMeasurement(Number(id), input))
  )

  // Substitui a foto de tabela anterior pela nova (mantém só a mais recente).
  // As medições (dado principal) já foram salvas acima; a foto é secundária —
  // se ela falhar, NÃO fingimos sucesso total: devolvemos um aviso ao cliente.
  let photoSaved = true
  try {
    const previous = await listPatientFiles(Number(id), 'evolution')
    await Promise.all(previous.map(async (f) => {
      await deleteFile(f.s3_key).catch(() => {})
      await deletePatientFile(f.id)
    }))
    // prepareImage sempre devolve JPEG — extensão e content-type acompanham
    const s3Key = `patients/${id}/evolution/${randomUUID()}.jpg`
    await uploadFile(s3Key, buffer, mediaType)
    await createPatientFile(Number(id), 'evolution', s3Key, photo.name)
  } catch (err) {
    photoSaved = false
    console.error('Erro ao salvar foto de evolução no S3:', err)
  }

  return Response.json(
    { measurements: created, photoSaved, ...(photoSaved ? {} : { warning: 'As medições foram salvas, mas a foto não pôde ser guardada.' }) },
    { status: 201 }
  )
}
