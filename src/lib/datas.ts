// Como uma data do banco vira texto na tela. PURO: sem React, sem banco.
//
// Existe como arquivo próprio porque a formatação estava COPIADA entre a tela
// da aba Estética e a versão em papel, e cada cópia podia derivar da outra sem
// ninguém notar — foi assim que o mesmo valor passou a ser exibido errado nos
// dois lugares de uma vez.
//
// São duas funções e não uma, e essa é a regra inteira: um `date` do Postgres é
// um DIA DE CALENDÁRIO e não admite conversão de fuso nenhuma; um `timestamptz`
// é um INSTANTE e exige a conversão para Brasília. Tratar os dois igual
// conserta um e quebra o outro.

const FUSO_CLINICA = 'America/Sao_Paulo'

const SEM_DATA = '—'

/** `new Date`, nunca método de string: o postgres.js devolve `Date` em coluna
 *  de data, e o mesmo campo chega como string quando vem por `fetch`. */
function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Um DIA PURO — coluna `date` do Postgres (`start_date`) ou texto `AAAA-MM-DD`
 * vindo de um `<input type="date">` — escrito igual ao que está no banco.
 *
 * O `timeZone: 'UTC'` aqui é o conserto, não um descuido. `2026-08-01` não é um
 * instante: é um dia que alguém digitou. Os dois caminhos por onde esse valor
 * chega entregam esse dia à meia-noite UTC — o postgres.js faz
 * `new Date('2026-08-01')` ao ler a coluna `date`, e esse mesmo `Date`
 * atravessa o `fetch` como `"2026-08-01T00:00:00.000Z"`. Formatar isso em
 * Brasília (UTC-3) recua para as 21h do dia anterior, e a tela mostrava
 * 31/07/2026 — um dia antes do que o dono cadastrou.
 */
export function fmtDiaPuro(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  if (!d) return SEM_DATA
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  })
}

/**
 * Um INSTANTE — coluna `timestamptz` (`completed_at`) ou um `new Date()` — no
 * fuso da clínica.
 *
 * Aqui a conversão é justamente o que se quer: uma sessão lançada às 22h de
 * Brasília é gravada como 01h UTC do dia seguinte, e quem lê o relatório precisa
 * ver o dia em que atendeu, não o dia do servidor.
 */
export function fmtInstante(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  if (!d) return SEM_DATA
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO_CLINICA,
  })
}

/**
 * O mesmo instante da função acima, mas COM A HORA.
 *
 * Existe para carimbar o relatório impresso: dois relatórios tirados no mesmo
 * dia ficavam idênticos no cabeçalho, e quem comparava as duas folhas na mesa
 * não sabia qual era a mais recente.
 */
export function fmtInstanteComHora(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  if (!d) return SEM_DATA
  const hora = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: FUSO_CLINICA,
  }).replace(':', 'h')
  return `${fmtInstante(d)} ${hora}`
}
