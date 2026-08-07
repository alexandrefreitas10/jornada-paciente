// Tipos do módulo de Treinamento de Atendimento.

export type CriterionKey =
  | 'acolhimento' | 'qualificacao' | 'argumentos'
  | 'objecoes' | 'fechamento' | 'precisao' | 'risco'

export type Scores = Record<CriterionKey, number>

export type Verdict = 'APROVADA' | 'APROVADA_COM_RESSALVA' | 'REPROVADA'

export type Outcome =
  | 'AGENDOU' | 'NAO_AGENDOU' | 'SUMIU'
  | 'PERDEU_O_PACIENTE' | 'DISPENSOU_BEM'

export type Level = 1 | 2 | 3 | 4 | 5
export type ScenarioKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J'

// --- Base de conhecimento ---

export interface Doctor {
  name: string
  nickname: string
  specialty: string
  yearsExperience: number
  education: string
  focus: string
}

export interface TrainingKb {
  doctors: Doctor[]
  consultation: {
    priceCents: number
    durationLabel: string
    includes: string[]
    returnWeeks: number
  }
  // Planos de acompanhamento. É o gabarito do cenário "consultou e não fechou
  // o protocolo" — sem isso a IA não sabe se o valor citado pela secretária existe.
  plans: { name: string; months: number; priceCents: number }[]
  payment: { methods: string[]; installments: string; discountPolicy: string }
  insurance: { accepts: boolean; note: string }
  procedures: { name: string; priceCents: number }[]
  weightLossDrugsPolicy: string
  noShowPolicy: string
  links: { site: string; instagram: string; google: string }
  redLines: string[]
  modelAnswers: string[]
}

// --- Persona sorteada para a sessão ---

export interface Persona {
  id: string
  name: string
  age: number
  story: string
  objections: string[]
  levels: Level[]
  scenarios: ScenarioKey[]
}

// --- Relatório da avaliadora ---

export interface RedFlag {
  quote: string
  redLine: string
  why: string
}

export interface Improvement {
  quote: string
  problem: string
}

export interface TrainingReport {
  outcome: Outcome
  redFlags: RedFlag[]
  scores: Scores
  rationales: Record<CriterionKey, string>
  strengths: string[]
  improvements: Improvement[]
  practicalTip: string
  nextTraining: string
}

// --- Persistência ---

export type SessionStatus = 'em_andamento' | 'encerrada' | 'avaliada'
export type MessageRole = 'paciente' | 'secretaria'

export interface TrainingMessage {
  id: number
  session_id: number
  role: MessageRole
  content: string
  position: number
  created_at: string
}

export interface TrainingSession {
  id: number
  user_id: number
  level: Level
  scenario: ScenarioKey
  persona: Persona
  kb_snapshot: TrainingKb
  status: SessionStatus
  // Veredito da IA-avaliadora (preenchido só em saveReport).
  outcome: Outcome | null
  // Desfecho que o próprio paciente declarou no marcador [[FIM:...]]. Entra no
  // prompt da avaliadora como sinal, não como decisão — ver evaluator.ts.
  declared_outcome: Outcome | null
  scores: Scores | null
  average: number | null
  has_red_flag: boolean
  verdict: Verdict | null
  report: TrainingReport | null
  started_at: string
  ended_at: string | null
  // Tokens de fato consumidos na API, acumulados inclusive sobre tentativas
  // descartadas (retry por quebra de personagem / avaliação inválida) — ver
  // comentário em patient.ts e evaluator.ts. patient_* somam todos os turnos
  // da conversa (haiku); eval_* são da chamada única de avaliação (opus).
  // Opcionais porque a API REMOVE estes campos para quem não é admin: custo é
  // informação de gestão. Esconder só na tela não bastaria — a resposta da API
  // fica visível no navegador de qualquer usuário.
  patient_input_tokens?: number
  patient_output_tokens?: number
  eval_input_tokens?: number
  eval_output_tokens?: number
}

// --- Linha de LISTA (histórico) ---
//
// Formato deliberadamente distinto de TrainingSession: a lista (histórico
// pessoal ou, para o admin, o histórico de um funcionário) só renderiza
// datas e notas, então a query de listagem (ver listSessions em sessions.ts)
// não busca persona, kb_snapshot, report nem as mensagens — os dois blobs
// JSONB grandes que tornavam GET /api/treinamento/sessions lento. Um tipo
// que finge ter esses campos (todos opcionais em cima de TrainingSession)
// mentiria sobre o que realmente vem do servidor e quebraria em runtime na
// primeira vez que alguém lesse `.report` de uma linha de lista — por isso
// é um tipo à parte, não um Partial<TrainingSession>.
export interface TrainingSessionListItem {
  id: number
  user_id: number
  // Nome de quem treinou — vem do JOIN com users. A tela do admin precisa do
  // nome; a API só tinha user_id numérico até aqui.
  username: string
  level: Level
  scenario: ScenarioKey
  status: SessionStatus
  outcome: Outcome | null
  average: number | null
  has_red_flag: boolean
  verdict: Verdict | null
  started_at: string
  ended_at: string | null
  // Mesma regra de TrainingSession: ausentes para quem não é admin (ver
  // withoutCost em guard.ts) — custo é informação de gestão.
  patient_input_tokens?: number
  patient_output_tokens?: number
  eval_input_tokens?: number
  eval_output_tokens?: number
}
