// __tests__/lib/task-definitions.test.ts
import { TASK_PHASES, ALL_TASK_KEYS } from '@/lib/task-definitions'

/**
 * As 22 chaves, na ordem em que aparecem no card.
 *
 * Esta lista existe por um motivo que o número solto "18" não dizia: cada
 * chave é **gravada no banco**, em `task_completions.task_key`. Renomear uma
 * chave aqui não renomeia nada — faz a tarefa voltar desmarcada para TODOS os
 * pacientes que já a tinham cumprido, e deixa a linha antiga órfã para sempre.
 * Trocar uma chave é migração, não refatoração.
 *
 * Acrescentar tarefa é normal: acrescente aqui também, no lugar certo da
 * ordem. O que este teste impede é a mudança que ninguém quis — chave
 * renomeada, tarefa removida por engano, duas tarefas com a mesma chave.
 */
const CHAVES_ESPERADAS = [
  // Pré-consulta
  'consulta_agendada',
  'consulta_confirmada',
  'bioimpedancia_info',
  'questionario_pre',
  'exames_prontuario',
  // Comercial
  'orcamento_enviado',
  'orcamento_fechado',
  'termo_enviado',
  'termo_assinado',
  // Onboarding
  'grupo_criado',
  'fotos_grupo',
  'bioimpedancia_grupo',
  'envio_pdf_parceiros',
  // Procedimento
  'procedimento_agendado',
  'estoque_conferido',
  // Nutrição
  'nao_vai_nutri',
  'enviado_nutri',
  'agendado_nutri',
  'dieta_recebida',
  // Tratamento
  'formulacoes_feitas',
  'iniciou_medicacao',
  'retorno_agendado',
]

describe('task-definitions', () => {
  it('tem exatamente 6 fases', () => {
    expect(TASK_PHASES).toHaveLength(6)
  })

  it('tem exatamente as tarefas esperadas, nesta ordem', () => {
    // Era aqui que estava escrito 18. São 22 desde a remoção do "Termos
    // assinados" do onboarding (`0ebf9ff`), e as quatro que entraram depois do
    // 18 vieram cada uma no seu commit de feature — o número estava velho, o
    // código não.
    expect(ALL_TASK_KEYS).toEqual(CHAVES_ESPERADAS)
  })

  it('o total das fases bate com a lista de chaves', () => {
    const total = TASK_PHASES.reduce((sum, phase) => sum + phase.tasks.length, 0)
    expect(total).toBe(CHAVES_ESPERADAS.length)
  })

  it('nenhuma chave repetida', () => {
    // Duas tarefas com a mesma chave viram a MESMA linha em
    // `task_completions`: marcar uma marcaria a outra, e ninguém entenderia.
    expect(new Set(ALL_TASK_KEYS).size).toBe(ALL_TASK_KEYS.length)
  })

  it('cada tarefa tem key e label', () => {
    for (const phase of TASK_PHASES) {
      for (const task of phase.tasks) {
        expect(task.key).toBeTruthy()
        expect(task.label).toBeTruthy()
      }
    }
  })
})
