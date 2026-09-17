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
  // Texto do dono (17/09). As quebras de linha vão para o WhatsApp como estão.
  verde: [
    'Oi, {nome}! Vamos ao seu acompanhamento semanal',
    '',
    '1️⃣ Como você ficou se sentindo após sua aplicação?',
    '1 = Me senti bem',
    '2 = Não vi diferença',
    '3 = Tive algum efeito colateral',
    '(Se for o 3, descreva o que sentiu)',
    '',
    '2️⃣ Como foi sua fome nessa última semana?',
    '1 = Pouca',
    '2 = Média',
    '3 = Muita',
    '',
    '3️⃣ Como foi sua alimentação na última semana?',
    '1 = Segui direitinho',
    '2 = Tive algumas dificuldades',
    '3 = Saí bastante do planejado',
    '',
    '4️⃣ Como foram as atividades físicas na última semana?',
    '1 = Não fiz nada',
    '2 = Treinei 1-3x',
    '3 = Treinei 3-5x',
    '4 = Todos os dias',
    '',
    'Obrigado! Essas informações nos ajudam a ajustar sua prescrição e garantir o melhor resultado na sua jornada de transformação 😍',
  ].join('\n'),
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

  const diasSemVir = Math.max(0, diasEntre(ultimaSaida, agora))
  const etiqueta: Etiqueta =
    diasSemVir <= DIAS_VERDE ? 'verde' : diasSemVir <= DIAS_AMARELA ? 'amarela' : 'vermelha'
  return { etiqueta, diasSemVir }
}

/** "ANA CAROLINE" → "Ana"; "MARIA-CLARA" → "Maria-Clara"; "D'ÁVILA" → "D'Ávila". */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  if (!primeiro) return ''
  const minusculo = primeiro.toLocaleLowerCase('pt-BR')
  return minusculo.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase('pt-BR'))
}

export function mensagemPara(etiqueta: Etiqueta, nomeCompleto: string): string {
  const nome = primeiroNome(nomeCompleto)
  const modelo = MENSAGENS[etiqueta]
  return nome ? modelo.replace('{nome}', () => nome) : modelo.replace(', {nome}!', '!')
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

/**
 * Implante é semestral e tem módulo próprio: não conta como aplicação do
 * tratamento semanal. Espelha o filtro SQL de listarEmTratamento.
 */
export function ehSaidaDeImplante(
  nomeItem: string | null | undefined,
  observacao: string | null | undefined,
): boolean {
  return (observacao ?? '') === 'Implante hormonal' || /implante/i.test(nomeItem ?? '')
}

export const LINHAS_RESUMO = 3
const CARACTERES_RESUMO = 180

/** Mensagem longa aparece recolhida no card, com botão para abrir. */
export function mensagemLonga(texto: string): boolean {
  return texto.split('\n').length > LINHAS_RESUMO || texto.length > CARACTERES_RESUMO
}
