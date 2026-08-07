// Agrega o histórico de UMA pessoa em poucos números para o "como ela está
// indo" que o admin vê na Fase 2 (escolher um funcionário e ver o resumo):
// quantos treinos, a média entre eles e quantos deram red flag. Módulo
// isolado e sem imports de propósito (mesma razão de pricing.ts/labels.ts):
// a tela do treino ('use client') importa daqui, e um import de
// './sessions' ou '@/lib/db' puxaria o driver postgres pro bundle do
// navegador e quebra o build — já aconteceu duas vezes neste projeto (ver
// comentário no topo de labels.ts).

export interface SessionSummaryInput {
  average: number | null
  has_red_flag: boolean
}

export interface SessionSummary {
  count: number
  averageScore: number | null
  redFlagCount: number
}

// "count" conta TODA sessão (inclusive em andamento, sem nota ainda) — é
// "quantos treinos essa pessoa fez", não "quantos ela terminou". A média,
// por outro lado, só pode olhar para quem já tem nota: misturar null como
// zero derrubaria a média artificialmente. Lista vazia (ou sem nenhuma
// sessão avaliada) devolve averageScore null, nunca NaN.
export function summarizeSessions(sessions: SessionSummaryInput[]): SessionSummary {
  const scored = sessions.filter((s): s is { average: number; has_red_flag: boolean } => s.average !== null)
  const averageScore = scored.length > 0
    ? scored.reduce((sum, s) => sum + s.average, 0) / scored.length
    : null
  const redFlagCount = sessions.filter(s => s.has_red_flag).length
  return { count: sessions.length, averageScore, redFlagCount }
}
