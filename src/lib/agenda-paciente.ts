// Regras do lado do PACIENTE na agenda. PURO: sem banco, sem React, sem rede.
//
// Estas regras existem no servidor, não só na tela. A tela some com o botão; o
// servidor é quem recusa. Sem isso, qualquer pessoa com a sessão do portal
// contorna o limite mandando o pedido direto.

import { somarDiasAoDia } from './datas'
import { vivo } from './agenda-grade'

/** Quanto o paciente enxerga à frente. */
export const SEMANAS_VISIVEIS = 4

/** Até quando ele mexe sozinho no próprio agendamento. */
export const HORAS_DE_ANTECEDENCIA = 1

/** O recado exato quando a hora já passou, nas palavras do dono. */
export const AVISO_EM_CIMA_DA_HORA =
  'Para remarcar com menos de 1h de antecedência, favor avisar no grupo de suporte pelo WhatsApp.'

/** Fuso da clínica. Horário de agendamento é horário DELA, não do aparelho. */
const FUSO = 'America/Sao_Paulo'

export interface AgendamentoDoPaciente {
  dia: string
  hora: string
  status: string
}

/** De hoje até o fim da janela, pontas incluídas. */
export function janelaDoPaciente(hoje: string): { de: string; ate: string } {
  return { de: hoje, ate: somarDiasAoDia(hoje, SEMANAS_VISIVEIS * 7 - 1) ?? hoje }
}

/**
 * O instante em que um agendamento começa, lido no fuso da CLÍNICA.
 *
 * `dia` e `hora` são texto de calendário, sem fuso embutido. Montar com
 * `new Date('...')` cru usaria o fuso de quem está rodando — e um paciente
 * viajando mudaria as próprias regras de prazo.
 */
function instanteDe(dia: string, hora: string): number {
  const [ano, mes, d] = dia.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  // O relógio de parede tratado como se fosse UTC — ponto de partida, não
  // resposta.
  const comoSeFosseUTC = Date.UTC(ano, mes - 1, d, h, min)
  // Duas passadas por causa do horário de verão: o deslocamento depende do
  // instante, e o instante depende do deslocamento. A segunda passada acerta
  // a borda onde o relógio muda. (O Brasil não tem mais horário de verão, mas
  // a conta não custa nada e volta a valer se voltar.)
  const primeiro = comoSeFosseUTC - desvioDoFuso(comoSeFosseUTC)
  return comoSeFosseUTC - desvioDoFuso(primeiro)
}

/**
 * Quanto o fuso da clínica está à frente do UTC naquele instante, em ms.
 *
 * Feito com `Intl`, e não com `toLocaleString` + `new Date`: aquele caminho
 * depende do fuso da MÁQUINA e se anula quando a máquina já está em Brasília —
 * ou seja, funciona no computador da clínica e erra no servidor. O teste da
 * borda exata pegou isso.
 */
function desvioDoFuso(instante: number): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instante))
  const p: Record<string, string> = {}
  for (const parte of partes) p[parte.type] = parte.value
  // `hour12: false` devolve "24" para a meia-noite em alguns ambientes.
  const hora = Number(p.hour) % 24
  const comoSeFosseUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hora, Number(p.minute), Number(p.second),
  )
  return comoSeFosseUTC - instante
}

/**
 * Pode marcar mais um?
 *
 * **Um agendamento vivo por vez, e quem libera o próximo é o RELÓGIO** — não
 * alguém clicar em "atendido". Decisão do dono, com motivo: se dependesse do
 * clique, um agendamento que a equipe esquecesse de fechar travaria o paciente
 * para sempre, sem ele entender por quê, e ele voltaria a pedir horário no
 * grupo — exatamente o fracasso que esta funcionalidade existe para evitar.
 *
 * `faltou`, `remarcou` e `desmarcou` não seguram nada.
 */
export function podeMarcarOutro(meus: AgendamentoDoPaciente[], agora: Date): boolean {
  const limite = agora.getTime()
  return !meus.some((a) => vivo(a.status) && instanteDe(a.dia, a.hora) > limite)
}

/**
 * O paciente ainda pode trocar ou desmarcar sozinho?
 *
 * Dentro da última hora, não: a clínica já separou medicação e organizou a
 * sala. Aí o caminho é o grupo de WhatsApp, e a tela diz isso com o texto de
 * `AVISO_EM_CIMA_DA_HORA`.
 */
export function podeMexerNoAgendamento(dia: string, hora: string, agora: Date): boolean {
  return comAntecedenciaMinima(dia, hora, agora)
}

/**
 * Esse horário está longe o bastante para o paciente DESMARCAR ou TROCAR?
 *
 * Exige a antecedência mínima porque, perto da hora, a clínica já separou a
 * medicação e organizou a sala — soltar a vaga aí perde o insumo.
 *
 * **Não vale para marcar.** As duas regras são diferentes de propósito (ver
 * `aindaNaoComecou`), e já errei isso: eu tinha deduzido que, se não dá para
 * trocar em cima da hora, também não daria para marcar. O dono corrigiu —
 * marcar não desperdiça nada.
 */
export function comAntecedenciaMinima(dia: string, hora: string, agora: Date): boolean {
  const faltam = instanteDe(dia, hora) - agora.getTime()
  return faltam >= HORAS_DE_ANTECEDENCIA * 3_600_000
}

/**
 * Esse horário ainda não começou?
 *
 * É a regra de MARCAR, e ela é deliberadamente frouxa: decisão do dono em
 * 13/11/2026 — *"para marcar o paciente pode marcar em cima da hora, não faz
 * diferença, desde que tenha horário disponível"*. Quem aparece na clínica e
 * encontra vaga em dez minutos pega a vaga.
 *
 * O único limite é o óbvio: horário que já começou não existe mais. Sem esta
 * conta, a agenda oferecia a um paciente às 15h12 os horários das 12h, 13h e
 * 14h **do mesmo dia**.
 */
export function aindaNaoComecou(dia: string, hora: string, agora: Date): boolean {
  return instanteDe(dia, hora) > agora.getTime()
}
