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
  outcome: Outcome | null
  scores: Scores | null
  average: number | null
  has_red_flag: boolean
  verdict: Verdict | null
  report: TrainingReport | null
  started_at: string
  ended_at: string | null
}
