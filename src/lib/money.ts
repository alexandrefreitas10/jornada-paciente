// Dinheiro: Real brasileiro (como o admin digita) <-> centavos (como o banco
// guarda). Módulo isolado e sem imports de propósito: a tela do admin
// (`'use client'`) precisa dessas duas funções, e qualquer import de
// './kb' ou '@/lib/db' puxaria o driver postgres (que usa 'tls'/'net') pro
// bundle do navegador e quebra o build.

export function centsToReais(cents: number): string {
  return cents ? (cents / 100).toFixed(2).replace('.', ',') : ''
}

// Nunca devolve NaN: campo vazio ou pela metade vira 0 até o usuário terminar
// de digitar. Trata ponto como separador de milhar e vírgula como decimal
// (convenção BR) — "1.500,00" e "1.500" são ambos R$ 1.500,00, nunca R$ 1,50.
// Antes disto usava `value.replace(',', '.')`, que só troca a PRIMEIRA
// ocorrência: "1.500,00" virava "1.500.00" -> parseFloat lia só "1.5" (150
// centavos em vez de 150000).
export function reaisToCents(value: string): number {
  const cleaned = value
    .replace(/[^\d.,-]/g, '') // remove "R$", espaços e outros símbolos
    .replace(/\./g, '')       // ponto = separador de milhar, sempre removido
    .replace(',', '.')        // vírgula = separador decimal
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
