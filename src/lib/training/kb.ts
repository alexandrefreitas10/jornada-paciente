import sql, { initSchema } from '@/lib/db'
import type { TrainingKb } from './types'

// Base vazia — só para pré-preencher o formulário do admin.
// NÃO passa em validateKb de propósito: sem gabarito não existe treino.
export const EMPTY_KB: TrainingKb = {
  doctors: [],
  consultation: { priceCents: 0, durationLabel: '', includes: [], returnWeeks: 8 },
  plans: [],
  plansNote: '',
  payment: { methods: [], installments: '', discountPolicy: '' },
  insurance: { accepts: false, note: '' },
  procedures: [],
  weightLossDrugsPolicy: '',
  noShowPolicy: '',
  links: { site: '', instagram: '', google: '' },
  redLines: [],
  modelAnswers: [],
}

function fail(msg: string): never {
  throw new Error(msg)
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${what} inválido`)
  return value as Record<string, unknown>
}

export function validateKb(data: unknown): TrainingKb {
  const kb = asObject(data, 'Base de conhecimento') as unknown as TrainingKb

  if (!Array.isArray(kb.doctors) || kb.doctors.length === 0) {
    fail('Cadastre pelo menos um médico.')
  }
  for (const d of kb.doctors) {
    if (!d?.name?.trim()) fail('Todo médico precisa de nome.')
    if (!Number.isFinite(d.yearsExperience) || d.yearsExperience <= 0) {
      fail(`Informe os anos de experiência de ${d.name}.`)
    }
  }

  const c = asObject(kb.consultation, 'Bloco da consulta')
  if (!Number.isFinite(c.priceCents) || (c.priceCents as number) <= 0) {
    fail('Informe o preço da consulta.')
  }
  if (!Array.isArray(kb.consultation.includes) || kb.consultation.includes.length === 0) {
    fail('Liste o que está incluso na consulta — é o argumento de valor da equipe.')
  }

  if (!Array.isArray(kb.redLines) || kb.redLines.length === 0) {
    fail('Cadastre pelo menos uma linha vermelha.')
  }

  asObject(kb.payment, 'Bloco de pagamento')
  asObject(kb.insurance, 'Bloco de convênio')
  asObject(kb.links, 'Bloco de links')
  if (!Array.isArray(kb.plans)) fail('Lista de planos de tratamento inválida.')
  if (!Array.isArray(kb.procedures)) fail('Lista de procedimentos inválida.')
  if (!Array.isArray(kb.modelAnswers)) fail('Lista de respostas-modelo inválida.')

  return kb
}

export function isKbComplete(data: unknown): boolean {
  try { validateKb(data); return true } catch { return false }
}

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

// Vira texto que entra tanto no prompt do paciente (para ele rebater)
// quanto no da avaliadora (como gabarito do critério PRECISÃO).
export function formatKbForPrompt(kb: TrainingKb): string {
  const doctors = kb.doctors.map(d =>
    `- ${d.name} (chamada de "${d.nickname}") — ${d.specialty}, ${d.yearsExperience} anos de experiência. ` +
    `Formação: ${d.education}. Atua em: ${d.focus}.`
  ).join('\n')

  const procedures = kb.procedures.length
    ? kb.procedures.map(p => `- ${p.name}: ${brl(p.priceCents)}`).join('\n')
    : '- (nenhum cadastrado)'

  const plans = kb.plans.length
    ? kb.plans.map(p => `- ${p.name} (${p.months} meses): ${brl(p.priceCents)}`).join('\n')
    : '- (nenhum cadastrado)'

  return [
    '## MÉDICOS', doctors,
    '',
    '## CONSULTA',
    `Valor: ${brl(kb.consultation.priceCents)}`,
    `Duração: ${kb.consultation.durationLabel}`,
    `Retorno incluso em ${kb.consultation.returnWeeks} semanas.`,
    'Inclui:', ...kb.consultation.includes.map(i => `- ${i}`),
    '',
    '## PLANOS DE ACOMPANHAMENTO', plans,
    '',
    '## PAGAMENTO',
    `Formas: ${kb.payment.methods.join(', ')}`,
    `Parcelamento: ${kb.payment.installments}`,
    `Política de desconto: ${kb.payment.discountPolicy}`,
    '',
    '## CONVÊNIO',
    kb.insurance.accepts ? 'Atende convênio.' : 'NÃO atende convênio.',
    kb.insurance.note,
    '',
    '## PROCEDIMENTOS ESTÉTICOS', procedures,
    '',
    '## CANETAS DE EMAGRECIMENTO', kb.weightLossDrugsPolicy,
    '',
    '## NO-SHOW E REMARCAÇÃO', kb.noShowPolicy,
    '',
    '## LINKS OFICIAIS',
    `Site: ${kb.links.site}`,
    `Instagram: ${kb.links.instagram}`,
    `Google: ${kb.links.google}`,
    '',
    '## LINHAS VERMELHAS (a secretária NUNCA pode)',
    ...kb.redLines.map(r => `- ${r}`),
    '',
    '## RESPOSTAS-MODELO (a clínica quer que sejam usadas)',
    ...kb.modelAnswers.map(a => `- "${a}"`),
  ].join('\n')
}

// --- Persistência ---

export async function readKb(): Promise<TrainingKb | null> {
  await initSchema()
  const [row] = await sql<{ data: TrainingKb }[]>`
    SELECT data FROM training_kb ORDER BY id DESC LIMIT 1
  `
  return row?.data ?? null
}

export async function writeKb(data: unknown, userId: number): Promise<TrainingKb> {
  const kb = validateKb(data)
  await initSchema()
  await sql`
    INSERT INTO training_kb (data, updated_by) VALUES (${sql.json(kb as never)}, ${userId})
  `
  return kb
}
