// Custo em dólar de uma sessão de treino. Módulo isolado e sem imports de
// propósito (mesma razão de money.ts): a tela do relatório e a tela de
// histórico ('use client') importam daqui, e qualquer import de './evaluator'
// ou '@/lib/db' puxaria o SDK da Anthropic ou o driver postgres pro bundle do
// navegador e quebra o build — já aconteceu duas vezes neste projeto (ver
// comentário no topo de labels.ts).

// Tarifas publicadas pela Anthropic, em USD por milhão de tokens. Valores
// vigentes em AGOSTO DE 2026 — não são buscados de lugar nenhum, são
// digitados aqui à mão. Se a Anthropic mudar o preço, esta constante fica
// desatualizada e o custo reportado fica errado EM SILÊNCIO (nenhum erro,
// nenhum aviso — só um número que não bate mais com a fatura real). Por
// isso, ao notar uma mudança de preço, atualize AQUI antes de qualquer outro
// lugar.
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-opus-5': { input: 5.0, output: 25.0 },
}

export interface SessionTokenUsage {
  patientInputTokens: number
  patientOutputTokens: number
  evalInputTokens: number
  evalOutputTokens: number
}

export interface SessionCost {
  patient: number
  grader: number
  total: number
}

function costOf(model: keyof typeof PRICING_USD_PER_MTOK, inputTokens: number, outputTokens: number): number {
  const rate = PRICING_USD_PER_MTOK[model]
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output
}

// Converte os 4 contadores de tokens de uma sessão (acumulados em
// sessions.ts, inclusive tentativas descartadas) no custo em dólar. "patient"
// é a conversa inteira (haiku, N turnos); "grader" é a avaliação final
// (opus, 1 chamada) — a diferença de preço entre os dois modelos é grande o
// bastante pra o grader dominar o total mesmo sendo uma chamada só.
export function sessionCostUsd(usage: SessionTokenUsage): SessionCost {
  const patient = costOf('claude-haiku-4-5', usage.patientInputTokens, usage.patientOutputTokens)
  const grader = costOf('claude-opus-5', usage.evalInputTokens, usage.evalOutputTokens)
  return { patient, grader, total: patient + grader }
}

// Formata um valor em dólar para leitura por um usuário brasileiro (vírgula
// decimal, prefixo "US$"). Sessões de treino custam frações de centavo de
// dólar — toFixed(2) fixo arredondaria a maioria delas para "US$ 0,00", que é
// indistinguível de custo zero. Em vez disso, aumenta as casas decimais até o
// valor arredondado deixar de ser zero (até um teto razoável).
export function formatUsd(amount: number): string {
  if (!(amount > 0)) return 'US$ 0,00'
  let decimals = 2
  while (decimals < 6 && Number(amount.toFixed(decimals)) === 0) decimals += 1
  return `US$ ${amount.toFixed(decimals).replace('.', ',')}`
}
