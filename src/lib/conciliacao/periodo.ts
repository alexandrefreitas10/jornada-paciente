import type { PeriodoExtrato } from './tipos'

// O mês de referência e a conferência de período. Puro, sem banco e sem
// biblioteca — é a regra que decide se um extrato serve para conciliar um mês,
// e por isso tem de ser testável sozinha.
//
// Por que a conferência existe: o extrato que não cobre o mês inteiro faz a
// conciliação acusar como "o BPO lançou e o banco não tem" tudo que aconteceu
// nos dias que o arquivo não traz. O dono cobraria do BPO pagamentos que de
// fato ocorreram. Melhor recusar o envio e dizer qual período exportar.

const MES = /^(\d{4})-(\d{2})$/

/** "2026-09" é um mês de referência plausível? */
export function mesValido(mes: string): boolean {
  const m = MES.exec(mes)
  if (!m) return false
  const ano = Number(m[1])
  const num = Number(m[2])
  return ano >= 1900 && ano <= 2199 && num >= 1 && num <= 12
}

function partes(mes: string): { ano: number; num: number } {
  const m = MES.exec(mes)
  if (!m || !mesValido(mes)) throw new Error(`Mês inválido: "${mes}". Esperado AAAA-MM.`)
  return { ano: Number(m[1]), num: Number(m[2]) }
}

/** Do dia 1 ao último dia do mês, em AAAA-MM-DD. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const { ano, num } = partes(mes)
  // Dia 0 do mês seguinte é o último dia deste. Em UTC, para o fuso da máquina
  // não mudar o dia.
  const ultimo = new Date(Date.UTC(ano, num, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

/** O mês anterior, virando o ano em janeiro. */
export function mesAnterior(mes: string): string {
  const { ano, num } = partes(mes)
  const anterior = num === 1 ? { ano: ano - 1, num: 12 } : { ano, num: num - 1 }
  return `${anterior.ano}-${String(anterior.num).padStart(2, '0')}`
}

/** A data (AAAA-MM-DD) cai dentro do mês de referência? */
export function dentroDoMes(data: string, mes: string): boolean {
  return data.startsWith(`${mes}-`)
}

/** "2026-09-30" → "30/09/2026", para a mensagem de erro falar a língua de quem lê. */
function br(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * `null` quando o extrato cobre o mês inteiro; senão a mensagem de recusa,
 * dizendo **o que veio e o que deveria vir**. Cobrir mais que o mês passa: o
 * que está fora é separado e contado por quem chama.
 */
export function conferirPeriodo(banco: string, periodo: PeriodoExtrato | null, mes: string): string | null {
  const { inicio, fim } = limitesDoMes(mes)
  const esperado = `${br(inicio)} a ${br(fim)}`
  if (!periodo) {
    return `Não foi possível ler o período declarado no extrato do ${banco}. Para conciliar ${br(inicio).slice(3)}, o extrato precisa cobrir ${esperado} — confira se o arquivo enviado é o extrato certo e exporte de novo.`
  }
  if (periodo.inicio <= inicio && periodo.fim >= fim) return null
  return `O extrato do ${banco} cobre ${br(periodo.inicio)} a ${br(periodo.fim)}, mas para conciliar ${br(inicio).slice(3)} ele precisa cobrir ${esperado}. Exporte o extrato desse período e envie de novo.`
}
