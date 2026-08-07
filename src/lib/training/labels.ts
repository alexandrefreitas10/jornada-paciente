import type { CriterionKey } from './types'

// Rótulos dos 7 critérios da rubrica, em arquivo próprio de propósito: são
// usados tanto pela IA-avaliadora (servidor) quanto pela tela do relatório
// (navegador). Se morassem em evaluator.ts, a tela arrastaria o SDK da
// Anthropic — e a chave de API — para o bundle do cliente.
export const CRITERION_LABELS: Record<CriterionKey, string> = {
  acolhimento: 'Acolhimento e clareza',
  qualificacao: 'Qualificação',
  argumentos: 'Argumentos e valor',
  objecoes: 'Objeções',
  fechamento: 'Fechamento',
  precisao: 'Precisão',
  risco: 'Risco',
}

// A ordem em que os critérios aparecem no relatório. Risco vem por último
// porque não entra na média — ele veta.
export const CRITERION_ORDER: CriterionKey[] = [
  'acolhimento', 'qualificacao', 'argumentos', 'objecoes', 'fechamento', 'precisao', 'risco',
]
