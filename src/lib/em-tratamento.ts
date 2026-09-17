// Regras da aba Relatórios › Em tratamento. Puro de propósito — sem banco e
// sem React — para as fronteiras (7, 8, 28, 29 dias; virada de dia em
// Brasília) serem testadas sem depender de relógio nem de dados.

export const ETIQUETAS = ['verde', 'amarela', 'vermelha'] as const
export type Etiqueta = (typeof ETIQUETAS)[number]

export type SubAba = 'todos' | 'nao_veio' | 'veio'

export const DIAS_VERDE = 7    // veio nos últimos 7 dias
export const DIAS_AMARELA = 28 // acima disso, crítico

export interface MarcacaoEnviada {
  template: Etiqueta
  sentBy: string | null
  sentAt: string // ISO
}

export interface PacienteEmTratamento {
  patientId: number
  nome: string
  ultimaAplicacao: string // ISO
  etiqueta: Etiqueta
  diasSemVir: number
  enviada: MarcacaoEnviada | null
}

// Os textos ainda vão ser revistos pelo dono — mudar um texto é só aqui.
export const MENSAGENS: Record<Etiqueta, string> = {
  verde:
    'Oi, {nome}! Tudo bem? 😊 Como você passou depois das suas aplicações? ' +
    'Está se sentindo bem? Qualquer dúvida, estamos por aqui.',
  amarela:
    'Oi, {nome}! Tudo bem? Percebemos que você não veio nesta semana. ' +
    'É muito importante manter suas aplicações semanais para o tratamento ' +
    'continuar dando resultado. Podemos agendar seu próximo horário?',
  vermelha:
    'Oi, {nome}! Tudo bem? Sentimos sua falta — já faz algumas semanas que ' +
    'você não vem às suas aplicações. Para o tratamento dar resultado, é muito ' +
    'importante retomar. Podemos agendar seu horário para esta semana?',
}

// Brasília é UTC-3 fixo desde 2019 (sem horário de verão). O banco guarda em
// UTC: sem este ajuste, uma aplicação às 22h viraria o dia seguinte.
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

/** "AAAA-MM-DD" do dia em Brasília. */
export function dataBrasilia(instante: Date): string {
  return new Date(instante.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 10)
}

/** Dias de calendário (em Brasília) entre dois instantes. */
export function diasEntre(anterior: Date, agora: Date): number {
  const a = Date.parse(`${dataBrasilia(anterior)}T00:00:00Z`)
  const b = Date.parse(`${dataBrasilia(agora)}T00:00:00Z`)
  return Math.round((b - a) / DIA_MS)
}

/** Segunda-feira ("AAAA-MM-DD") da semana de Brasília que contém `agora`. */
export function inicioDaSemanaBrasilia(agora: Date): string {
  const dia = new Date(`${dataBrasilia(agora)}T00:00:00Z`)
  const recuo = (dia.getUTCDay() + 6) % 7 // domingo=0 → 6 dias até a segunda
  return new Date(dia.getTime() - recuo * DIA_MS).toISOString().slice(0, 10)
}

/**
 * `null` quando o paciente não está em tratamento: nunca teve aplicação, ou a
 * folha de prescrição finalizada veio depois da última aplicação. Uma
 * aplicação depois da folha é um novo ciclo e o traz de volta.
 */
export function classificar(
  ultimaSaida: Date | null,
  ultimaFolha: Date | null,
  agora: Date,
): { etiqueta: Etiqueta; diasSemVir: number } | null {
  if (!ultimaSaida) return null
  if (ultimaFolha && ultimaFolha.getTime() >= ultimaSaida.getTime()) return null

  const diasSemVir = diasEntre(ultimaSaida, agora)
  const etiqueta: Etiqueta =
    diasSemVir <= DIAS_VERDE ? 'verde' : diasSemVir <= DIAS_AMARELA ? 'amarela' : 'vermelha'
  return { etiqueta, diasSemVir }
}

/** "ANA CAROLINE" → "Ana". */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  if (!primeiro) return ''
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR')
}

export function mensagemPara(etiqueta: Etiqueta, nomeCompleto: string): string {
  return MENSAGENS[etiqueta].replace('{nome}', primeiroNome(nomeCompleto))
}

/**
 * "Veio" em ordem de nome. "Não veio" e "Todos" por urgência: quem está há
 * mais dias sem vir primeiro — os críticos precisam aparecer antes.
 */
export function listarSubAba(lista: PacienteEmTratamento[], subAba: SubAba): PacienteEmTratamento[] {
  const porNome = (a: PacienteEmTratamento, b: PacienteEmTratamento) => a.nome.localeCompare(b.nome, 'pt-BR')

  if (subAba === 'veio') {
    return lista.filter(p => p.etiqueta === 'verde').sort(porNome)
  }
  const base = subAba === 'nao_veio' ? lista.filter(p => p.etiqueta !== 'verde') : [...lista]
  return base.sort((a, b) => b.diasSemVir - a.diasSemVir || porNome(a, b))
}
