import Anthropic from '@anthropic-ai/sdk'
import { formatKbForPrompt } from './kb'
import { LEVELS, SCENARIOS } from './personas'
import type { Level, Outcome, Persona, ScenarioKey, TrainingKb, TrainingMessage } from './types'

const PATIENT_MODEL = 'claude-haiku-4-5'
const MAX_BUBBLES = 3

const OUTCOMES: Outcome[] = ['AGENDOU', 'NAO_AGENDOU', 'SUMIU', 'PERDEU_O_PACIENTE', 'DISPENSOU_BEM']

// Marcadores de que a IA saiu do personagem e virou "treinador".
const LEAK_MARKERS = [
  /AVALIA[ÇC][ÃA]O\s*:/i,
  /NOTA\s+FINAL/i,
  /SIMULA[ÇC][ÃA]O/i,
  /PONTOS?\s+FORTES?/i,
  /DICA\s+PR[ÁA]TICA/i,
  /ACOLHIMENTO\s*\(/i,
  /\bPaciente\s*\([^)]*\)\s*:/i,
]

// Terceira pessoa: "<Primeiro nome> <verbo de estado>".
// Foi exatamente assim que o agente de mercado vazou ("Lúcia ainda está na dúvida").
const THIRD_PERSON_VERBS =
  '(?:ainda\\s+)?(?:está|esta|ficou|fica|acha|achou|quer|queria|vai|pensa|pensou|prefere|sente|sentiu|decidiu)'

// Escapa metacaracteres de regex antes de interpolar texto livre num RegExp.
// As 11 personas de hoje têm nomes só com letras, mas isso não é garantido pra sempre.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function breaksCharacter(text: string, personaName: string): boolean {
  if (LEAK_MARKERS.some(re => re.test(text))) return true

  const firstName = personaName.trim().split(/\s+/)[0]
  if (!firstName) return false
  // Exige que o nome NÃO venha logo depois de "a"/"o"/"é"/"chamo" — nesses
  // casos o paciente está se apresentando, não falando de si em terceira pessoa.
  // Nota: o \b final NÃO pode ser usado aqui — em JS, \b só reconhece [A-Za-z0-9_]
  // como "caractere de palavra", então depois de um verbo acentuado ("está", "ficará")
  // seguido de espaço, \b considera as duas pontas "não-palavra" e falha em bater.
  // Por isso o fim do verbo é fechado com um lookahead negativo explícito.
  const re = new RegExp(
    `(?<!\\b(?:a|o|é|e|sou|chamo|aqui)\\s)\\b${escapeRegExp(firstName)}\\s+${THIRD_PERSON_VERBS}(?![a-zA-ZÀ-ÿ])`,
    'i'
  )
  return re.test(text)
}

// Modelos às vezes vazam token especial no texto (visto na conversa real:
// "Tô bem dividida ainda...<|eos|>"). Nunca pode chegar na tela.
const SPECIAL_TOKENS = /<\|[a-z_]+\|>/gi

export function splitBubbles(raw: string): string[] {
  return raw
    .replace(SPECIAL_TOKENS, '')
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BUBBLES)
}

// Tolerante a variação do modelo: espaço em volta dos dois-pontos/colchetes e
// caixa baixa ("[[FIM: agendou]]") — sem isso o marcador vaza pra tela como texto.
const END_MARKER_SOURCE = '\\[\\[\\s*FIM\\s*:\\s*([A-Z_]+)\\s*\\]\\]'

export function detectEnding(raw: string): { text: string; outcome: Outcome | null } {
  const match = raw.match(new RegExp(END_MARKER_SOURCE, 'i'))
  let text = raw.replace(new RegExp(END_MARKER_SOURCE, 'gi'), '').trim()
  // Markdown que envolvia o marcador (ex: "**[[FIM:AGENDOU]]**") vira resíduo tipo
  // "****" depois de remover o marcador — se sobrou só isso, não é uma mensagem.
  if (/^[*_\s]*$/.test(text)) text = ''
  if (!match) return { text, outcome: null }
  const candidate = match[1].toUpperCase() as Outcome
  return { text, outcome: OUTCOMES.includes(candidate) ? candidate : null }
}

export function buildPatientSystemPrompt(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
}): string {
  const { persona, level, scenario, kb } = params
  return `Você é um PACIENTE entrando em contato com uma clínica pelo WhatsApp. Isto é um treino: do outro lado está uma secretária real praticando atendimento. Você NUNCA sai do personagem.

# QUEM VOCÊ É
Nome: ${persona.name}, ${persona.age} anos.
História: ${persona.story}
Suas objeções: ${persona.objections.map(o => `"${o}"`).join(', ')}

# SITUAÇÃO
Cenário: ${SCENARIOS[scenario]}
Nível de dificuldade ${level}: ${LEVELS[level]}

# COMO VOCÊ ESCREVE
- Como gente no WhatsApp: mensagens CURTAS, informais, sem parágrafo organizado.
- Erra digitação de vez em quando ("qnto", "vc", "obg", sem acento).
- Pode mandar 1, 2 ou no máximo 3 balões seguidos. Separe cada balão com UMA LINHA EM BRANCO.
- De vez em quando manda áudio: escreva exatamente no formato [áudio de 0:14 — transcrição: "..."].
- NUNCA escreve textão. NUNCA assina o nome no fim. NUNCA usa "Atenciosamente".
- Não facilita: só cede quando a secretária realmente merecer.

# PROIBIÇÕES ABSOLUTAS
- NUNCA avalie, comente ou dê nota ao atendimento da secretária.
- NUNCA use as palavras "simulação", "treino", "avaliação", "acolhimento", "nota".
- NUNCA fale de si em terceira pessoa. Você é ${persona.name.split(' ')[0]}; diga "eu", nunca "${persona.name.split(' ')[0]} está...".
- NUNCA escreva "Paciente:" ou qualquer rótulo antes da sua mensagem.

# QUANDO A CONVERSA ACABA
Quando o assunto chegar num desfecho natural, escreva sua última mensagem e acrescente, em uma linha separada no fim, UM destes marcadores:
[[FIM:AGENDOU]] — você marcou consulta com dia e hora.
[[FIM:NAO_AGENDOU]] — a conversa acabou sem agendamento, sem briga.
[[FIM:SUMIU]] — você decidiu parar de responder. (Só a partir do nível 3.)
[[FIM:PERDEU_O_PACIENTE]] — você foi embora irritado, ou ela desistiu de você.
[[FIM:DISPENSOU_BEM]] — você é um caso impossível e ela encerrou com firmeza e educação, sem julgar você.
Se a conversa ainda não acabou, NÃO escreva marcador nenhum.

# O QUE A CLÍNICA REALMENTE OFERECE
Use isto para rebater a secretária quando ela falar algo diferente ("mas no site de vocês diz outra coisa"). Você NÃO entrega essa informação de graça — você é o paciente, não o roteiro.

${formatKbForPrompt(kb)}`
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export class OutOfCreditsError extends Error {
  constructor() { super('Os créditos da IA acabaram. A conversa foi salva e pode ser avaliada depois.') }
}

// Extrai só a frase de erro da API — err.message vem com o JSON inteiro.
// (mesma forma usada em measurements/extract/route.ts)
function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = (err as { error?: { error?: { message?: string } } }).error
  return body?.error?.message ?? err.message
}

// Saldo zerado na Anthropic volta como 400 com mensagem de billing — não como um
// erro dedicado. Sem esta checagem, vira "Unexpected end of JSON input" na tela.
// Um 400 comum (ex: requisição malformada) NÃO é erro de crédito — não pode virar
// "recarregue seus créditos" pra quem só mandou um pedido inválido. 403 também fica
// de fora: é permission_error (chave revogada/errada), não cobrança.
export function isCreditError(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false
  if (err.status !== 400) return false
  return /credit balance is too low|insufficient credit|billing/i.test(apiMessage(err))
}

function toAnthropicMessages(history: TrainingMessage[]): Anthropic.MessageParam[] {
  // O paciente é o "assistant" do ponto de vista do modelo; a secretária é o "user".
  return history.map(m => ({
    role: m.role === 'paciente' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }))
}

// Decide o que fazer com uma resposta bruta do modelo-paciente: aceitar o turno,
// ou sinalizar que precisa tentar de novo (retorna null). Função pura — sem
// chamada de rede — pra dar pra testar os casos de borda sem mockar a API.
export function resolvePatientTurn(
  raw: string,
  personaName: string
): { bubbles: string[]; outcome: Outcome | null } | null {
  const { text, outcome } = detectEnding(raw)
  if (!text) {
    // Só veio o marcador, sem texto de verdade. Se o desfecho é válido, é um fim
    // de conversa silencioso — não pode virar retry infinito nem "travou aqui".
    return outcome ? { bubbles: [], outcome } : null
  }
  if (breaksCharacter(text, personaName)) return null
  const bubbles = splitBubbles(text)
  return bubbles.length > 0 ? { bubbles, outcome } : null
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

// Gera o próximo turno do paciente. Descarta e regera uma vez se a IA quebrar o personagem.
export async function nextPatientTurn(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
  history: TrainingMessage[]
}): Promise<{ bubbles: string[]; outcome: Outcome | null; usage: TokenUsage }> {
  const system = buildPatientSystemPrompt(params)
  const messages = toAnthropicMessages(params.history)
  // Primeira mensagem da conversa: o paciente abre, então precisa de um turno de user.
  if (messages.length === 0 || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: '(A secretária ainda não respondeu. Abra a conversa.)' })
  }

  // Acumula tokens de TODAS as tentativas, mesmo as que quebram o personagem
  // e são descartadas — elas foram cobradas da mesma forma, então um relatório
  // de custo que só contasse a tentativa vencedora estaria subestimando o
  // gasto real. Ver mesma lógica em evaluator.ts.
  let inputTokens = 0
  let outputTokens = 0

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      const message = await getClient().messages.create({
        model: PATIENT_MODEL,
        max_tokens: 1024,
        system,
        messages,
      })
      inputTokens += message.usage.input_tokens
      outputTokens += message.usage.output_tokens
      const block = message.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      raw = block?.text ?? ''
    } catch (err) {
      if (isCreditError(err)) throw new OutOfCreditsError()
      throw err
    }

    const resolved = resolvePatientTurn(raw, params.persona.name)
    if (resolved) return { ...resolved, usage: { inputTokens, outputTokens } }
  }

  // Duas tentativas quebraram o personagem — devolve algo neutro em vez de vazar avaliação.
  return { bubbles: ['desculpa, travou aqui... vc pode repetir?'], outcome: null, usage: { inputTokens, outputTokens } }
}
