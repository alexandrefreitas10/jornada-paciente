import Anthropic from '@anthropic-ai/sdk'
import { formatKbForPrompt } from './kb'
import { LEVELS, SCENARIOS } from './personas'
import { isCreditError, OutOfCreditsError } from './patient'
import type {
  CriterionKey, Level, Outcome, Persona, ScenarioKey,
  TrainingKb, TrainingMessage, TrainingReport,
} from './types'

// Uma chamada por sessão. É o produto — vale o modelo forte.
const EVALUATOR_MODEL = 'claude-opus-5'

import { CRITERION_LABELS } from './labels'

// Reexportado para não quebrar quem já importava daqui. A definição mora em
// labels.ts porque a tela do relatório também precisa dela e não pode importar
// deste arquivo (aqui tem o SDK da Anthropic).
export { CRITERION_LABELS }

const CRITERION_KEYS = Object.keys(CRITERION_LABELS) as CriterionKey[]
const OUTCOMES: Outcome[] = ['AGENDOU', 'NAO_AGENDOU', 'SUMIU', 'PERDEU_O_PACIENTE', 'DISPENSOU_BEM']

// Sem minimum/maximum: constraints numéricas não são suportadas no structured
// output da Anthropic (só são removidas automaticamente no caminho zodOutputFormat/
// messages.parse — aqui o schema vai cru pro output_config.format e pode voltar 400).
// O intervalo 0–10 é garantido por parseReport, não pelo schema.
const scoreProp = { type: 'number' }
const stringProp = { type: 'string' }

export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'redFlags', 'scores', 'rationales', 'strengths', 'improvements', 'practicalTip', 'nextTraining'],
  properties: {
    outcome: { type: 'string', enum: OUTCOMES },
    redFlags: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['quote', 'redLine', 'why'],
        properties: { quote: stringProp, redLine: stringProp, why: stringProp },
      },
    },
    scores: {
      type: 'object', additionalProperties: false,
      required: CRITERION_KEYS,
      properties: Object.fromEntries(CRITERION_KEYS.map(k => [k, scoreProp])),
    },
    rationales: {
      type: 'object', additionalProperties: false,
      required: CRITERION_KEYS,
      properties: Object.fromEntries(CRITERION_KEYS.map(k => [k, stringProp])),
    },
    strengths: { type: 'array', items: stringProp },
    improvements: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['quote', 'problem'],
        properties: { quote: stringProp, problem: stringProp },
      },
    },
    practicalTip: stringProp,
    nextTraining: stringProp,
  },
} as const

function fail(msg: string): never { throw new Error(`Avaliação inválida: ${msg}`) }

export function parseReport(data: unknown): TrainingReport {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('não é um objeto')
  const r = data as Record<string, unknown>

  if (typeof r.outcome !== 'string' || !OUTCOMES.includes(r.outcome as Outcome)) {
    fail(`desfecho desconhecido: ${String(r.outcome)}`)
  }

  const scores = r.scores
  if (!scores || typeof scores !== 'object') fail('bloco scores ausente')
  for (const key of CRITERION_KEYS) {
    const value = (scores as Record<string, unknown>)[key]
    if (typeof value !== 'number' || Number.isNaN(value)) fail(`nota ausente para ${key}`)
    if (value < 0 || value > 10) fail(`nota de ${key} fora do intervalo entre 0 e 10`)
  }

  const rationales = r.rationales
  if (!rationales || typeof rationales !== 'object') fail('bloco rationales ausente')
  for (const key of CRITERION_KEYS) {
    if (typeof (rationales as Record<string, unknown>)[key] !== 'string') {
      fail(`justificativa ausente para ${key}`)
    }
  }

  if (!Array.isArray(r.redFlags)) fail('redFlags não é lista')
  for (const flag of r.redFlags as Record<string, unknown>[]) {
    if (typeof flag?.quote !== 'string' || !flag.quote.trim()) {
      fail('todo alerta vermelho precisa citar a frase exata da secretária')
    }
    if (typeof flag.redLine !== 'string' || typeof flag.why !== 'string') {
      fail('alerta vermelho incompleto')
    }
  }

  if (!Array.isArray(r.improvements)) fail('improvements não é lista')
  for (const item of r.improvements as Record<string, unknown>[]) {
    if (typeof item?.quote !== 'string' || !item.quote.trim()) {
      fail('todo ponto de melhoria precisa citar literalmente o que ela escreveu')
    }
    if (typeof item.problem !== 'string' || !item.problem.trim()) fail('ponto de melhoria sem explicação')
  }

  if (!Array.isArray(r.strengths)) fail('strengths não é lista')
  if (typeof r.practicalTip !== 'string' || !r.practicalTip.trim()) fail('dica prática ausente')
  if (typeof r.nextTraining !== 'string' || !r.nextTraining.trim()) fail('próximo treino ausente')

  return data as TrainingReport
}

// Como o paciente descreve, em primeira pessoa, cada desfecho que ele pode
// declarar. Espelha a lista do marcador [[FIM:...]] em patient.ts — o texto está
// aqui de novo porque a avaliadora precisa saber o que o sinal SIGNIFICA, não só
// a sigla. "SUMIU" sozinho é ambíguo; "ele decidiu parar de responder" não é.
const DECLARED_OUTCOME_MEANINGS: Record<Outcome, string> = {
  AGENDOU: 'ele considera que marcou consulta, com dia e hora',
  NAO_AGENDOU: 'para ele a conversa acabou sem agendamento e sem briga',
  SUMIU: 'ele decidiu parar de responder — não é o fim natural da conversa, é abandono',
  PERDEU_O_PACIENTE: 'ele foi embora irritado, ou entendeu que a secretária desistiu dele',
  DISPENSOU_BEM: 'ele se reconhece como caso impossível e achou que ela encerrou com firmeza e educação',
}

// O sinal do paciente entra como CONTEXTO, nunca como veredito: quem julga é a
// avaliadora (modelo forte) olhando o transcript — o paciente é o haiku barato e
// pode ter se enganado, ou declarado o fim por cansaço. Sem esta seção, porém,
// ela recebia um transcript que simplesmente para e tinha que adivinhar se o
// paciente sumiu ou se a conversa terminou.
function declaredOutcomeSection(declared: Outcome | null | undefined): string {
  if (!declared) return ''
  return `
# SINAL DO PACIENTE
Ao encerrar, o paciente simulado sinalizou o desfecho ${declared} — ${DECLARED_OUTCOME_MEANINGS[declared]}.
Isso é um SINAL, não o veredito: quem decide o desfecho é você. Confirme se ele bate com o que a conversa mostra e, se não bater, corrija — o campo "outcome" do relatório é o SEU julgamento, não a repetição deste sinal.
`
}

export function buildEvaluatorPrompt(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
  declaredOutcome?: Outcome | null
}): string {
  const { persona, level, scenario, kb, declaredOutcome } = params
  return `Você é um treinador de atendimento de clínicas médicas. Avalie a conversa abaixo, em que uma SECRETÁRIA atendeu um paciente simulado no WhatsApp.

# O TREINO
Paciente: ${persona.name}, ${persona.age} anos. ${persona.story}
Cenário: ${SCENARIOS[scenario]}
Nível ${level}: ${LEVELS[level]}
${declaredOutcomeSection(declaredOutcome)}
# GABARITO — a verdade sobre esta clínica
Tudo que a secretária afirmar diferente disto é ERRO DE PRECISÃO, mesmo que soe bem.

${formatKbForPrompt(kb)}

# COMO AVALIAR

Dê nota de 0 a 10 (uma casa decimal) em cada critério, com uma justificativa de uma linha:

1. acolhimento — tom, uso do nome, empatia. Também pesa AQUI: mensagem longa demais para WhatsApp e erro de digitação.
2. qualificacao — perguntou o nome, a origem do lead, o objetivo, o que deu errado antes.
3. argumentos — usou os diferenciais REAIS da clínica (a lista do gabarito) para justificar o preço.
4. objecoes — preço, comparação com concorrente, experiência ruim, desconfiança.
5. fechamento — ofereceu horário concreto e criou próximo passo com data.
6. precisao — cobre APENAS o que o paciente vai cobrar de volta depois: preço da consulta, parcelamento e formas de pagamento, o que está incluso, convênio, prazo de retorno. Só derrube esta nota quando a informação errada criaria uma expectativa que a clínica não vai honrar (dizer um preço menor, prometer um parcelamento que não existe, incluir algo que não está incluso).
   NÃO desconte por: anos de experiência, formação, títulos, quantidade de pacientes atendidos, jeito de descrever a médica ou a equipe. Isso é construção de credibilidade — variação aí não é erro, e o treino não é prova de decoreba. Se um campo do gabarito estiver marcado como NÃO CADASTRADO, não avalie precisão sobre ele: dê 10 e diga na justificativa que a clínica ainda não definiu essa política.
7. risco — critério BINÁRIO, nunca uma nota intermediária: 10 se ela não cruzou nenhuma linha vermelha; 0 se cruzou. Não existe 5, 7, 9 aqui — ou é 10, ou é 0. Se der 0, registre OBRIGATORIAMENTE o alerta correspondente em redFlags (nunca dê risco 0 sem um redFlag citando a frase exata).

## Desfecho
Escolha um: AGENDOU, NAO_AGENDOU, SUMIU, PERDEU_O_PACIENTE, DISPENSOU_BEM.
- DISPENSOU_BEM só vale se ela SUSTENTOU a conversa e encerrou com firmeza e educação, sem julgar o paciente. Desistir na segunda objeção ou dizer coisas como "não é o seu momento" é PERDEU_O_PACIENTE.
- Quando o desfecho é DISPENSOU_BEM, avalie "fechamento" como "encerrou bem", não como "não agendou". Nesse caso não ofereceu horário NÃO é falha.

## Alertas vermelhos (redFlags)
Para CADA linha vermelha cruzada, registre a frase EXATA que ela escreveu, qual linha cruzou e por que é grave. Se não cruzou nenhuma, devolva lista vazia. Nunca invente um alerta.

## Pontos de melhoria (improvements)
Cada item precisa CITAR LITERALMENTE o que ela escreveu, e depois explicar o problema. Nunca escreva conselho genérico solto.

## Dica prática (practicalTip)
Uma frase PRONTA que ela possa copiar e usar na próxima vez, no contexto desta conversa.

## Próximo treino (nextTraining)
Sugira nível e cenário com base no critério MAIS FRACO — não suba de nível automaticamente.

Escreva tudo em português do Brasil, direto e sem rodeio. Seja justo: é treino, não punição.`
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function transcript(messages: TrainingMessage[]): string {
  return messages
    .map(m => `${m.role === 'paciente' ? 'PACIENTE' : 'SECRETÁRIA'}: ${m.content}`)
    .join('\n')
}

// Classifica o resultado bruto de uma chamada ao avaliador antes de tentar o
// JSON.parse. Pura — sem chamada de rede — pra testar sem mockar a API.
// - "refusal": claude-opus-5 recusou por segurança (HTTP 200, conteúdo vazio).
//   Tentar de novo com o mesmo pedido não muda nada, então NÃO é retryable.
// - "incomplete": max_tokens cortou a resposta (thinking + texto dividem o teto),
//   ou o bloco de texto veio vazio por algum outro motivo. É retryable.
export function evaluatorFailureReason(
  stopReason: string | null,
  raw: string
): 'refusal' | 'incomplete' | null {
  if (stopReason === 'refusal') return 'refusal'
  if (stopReason === 'max_tokens' || !raw) return 'incomplete'
  return null
}

export async function evaluateSession(params: {
  persona: Persona
  level: Level
  scenario: ScenarioKey
  kb: TrainingKb
  messages: TrainingMessage[]
  declaredOutcome?: Outcome | null
}): Promise<TrainingReport> {
  const system = buildEvaluatorPrompt(params)
  const user = `# A CONVERSA\n\n${transcript(params.messages)}`

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    let stopReason: string | null
    try {
      // Streaming porque claude-opus-5 pensa por padrão, e max_tokens limita
      // thinking + texto juntos — sem stream a requisição pode estourar timeout.
      const message = await getClient().messages
        .stream({
          model: EVALUATOR_MODEL,
          max_tokens: 32000,
          system,
          // output_config (structured outputs) — é o que garante que a resposta
          // seja JSON válido conforme REPORT_SCHEMA. NÃO remover.
          output_config: {
            effort: 'high',
            format: { type: 'json_schema', schema: REPORT_SCHEMA as unknown as Record<string, unknown> },
          },
          messages: [{ role: 'user', content: user }],
        })
        .finalMessage()
      const block = message.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      raw = block?.text ?? ''
      stopReason = message.stop_reason
    } catch (err) {
      if (isCreditError(err)) throw new OutOfCreditsError()
      throw err
    }

    // Checa ANTES do JSON.parse — resposta vazia (recusa ou corte) vira um
    // "Unexpected end of JSON input" cru se deixar chegar no parse direto.
    const reason = evaluatorFailureReason(stopReason, raw)
    if (reason === 'refusal') {
      throw new Error('A IA se recusou a avaliar esta conversa. Avalie manualmente ou rode o treino de novo.')
    }
    if (reason === 'incomplete') {
      lastError = new Error('A avaliação voltou incompleta da IA (resposta cortada).')
      continue
    }

    try {
      return parseReport(JSON.parse(raw))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Avaliação inválida')
}
