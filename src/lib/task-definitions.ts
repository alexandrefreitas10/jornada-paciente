// src/lib/task-definitions.ts
export interface Task {
  key: string
  label: string
}

export interface TaskPhase {
  key: string
  label: string
  icon: string
  tasks: Task[]
}

export const TASK_PHASES: TaskPhase[] = [
  {
    key: 'pre_consulta',
    label: 'Pré-consulta',
    icon: '📋',
    tasks: [
      { key: 'consulta_agendada', label: 'Consulta agendada' },
      { key: 'consulta_confirmada', label: 'Consulta confirmada' },
      { key: 'bioimpedancia_info', label: 'Informações da bioimpedância' },
      { key: 'questionario_pre', label: 'Questionário pré consulta' },
      { key: 'exames_prontuario', label: 'Exames / prontuário' },
    ],
  },
  {
    key: 'comercial',
    label: 'Comercial',
    icon: '💰',
    tasks: [
      { key: 'orcamento_enviado', label: 'Orçamento enviado' },
      { key: 'orcamento_fechado', label: 'Orçamento fechado' },
      { key: 'termo_enviado', label: 'Termo enviado' },
      { key: 'termo_assinado', label: 'Termo assinado' },
    ],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    icon: '💬',
    tasks: [
      { key: 'grupo_criado', label: 'Criação do grupo' },
      { key: 'fotos_grupo', label: 'Envio de fotos no grupo' },
      { key: 'bioimpedancia_grupo', label: 'Envio da bioimpedância no grupo' },
      { key: 'envio_pdf_parceiros', label: 'Envio do PDF com parceiros' },
    ],
  },
  {
    key: 'procedimento',
    label: 'Procedimento',
    icon: '🏥',
    tasks: [
      { key: 'procedimento_agendado', label: 'Procedimento agendado' },
      { key: 'estoque_conferido', label: 'Estoque conferido' },
    ],
  },
  {
    key: 'nutricao',
    label: 'Nutrição',
    icon: '🥗',
    tasks: [
      { key: 'nao_vai_nutri', label: 'Não vai para nutri' },
      { key: 'enviado_nutri', label: 'Enviado para nutri' },
      { key: 'agendado_nutri', label: 'Agendado com a nutri' },
      { key: 'dieta_recebida', label: 'Dieta recebida' },
    ],
  },
  {
    key: 'tratamento',
    label: 'Tratamento',
    icon: '💊',
    tasks: [
      { key: 'formulacoes_feitas', label: 'Formulações feitas' },
      { key: 'iniciou_medicacao', label: 'Iniciou medicação' },
      { key: 'retorno_agendado', label: 'Retorno agendado' },
    ],
  },
]

export const ALL_TASK_KEYS: string[] = TASK_PHASES.flatMap((phase) =>
  phase.tasks.map((task) => task.key)
)
