import type { StatusAgendamento } from './agenda-status'

// Como o status aparece para quem usa: palavra e cor.
//
// POR QUE ESTE MÓDULO EXISTE: até aqui isto morava dentro de
// `src/app/agenda/AgendaClient.tsx`, porque só a grade da agenda mostrava
// status. A sub-aba Relatórios › Agendamentos mostra os mesmos — e copiar
// criaria a segunda cópia. Foi assim que a regra `vivo()` acabou escrita em
// seis lugares neste módulo e derivou em um deles, deixando a grade esconder
// `desmarcou` e mostrar `remarcou`. Uma fonte só.
//
// `import type` de propósito: `agenda-db` abre conexão com o Postgres, e estes
// mapas são usados por componentes de tela. Tipo é apagado na compilação, então
// importar assim não arrasta o banco para o navegador.

/** A palavra da clínica. O banco guarda 'faltou'; a pessoa lê "Faltou". */
export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  atendido: 'Atendido',
  faltou: 'Faltou',
  remarcou: 'Remarcou',
  desmarcou: 'Desmarcou',
}

/** Classes Tailwind da etiqueta. Mesmos valores que a grade já usava. */
export const COR_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'bg-violet-100 text-violet-800 border-violet-200',
  atendido: 'bg-green-100 text-green-800 border-green-200',
  faltou: 'bg-red-100 text-red-800 border-red-200',
  remarcou: 'bg-amber-100 text-amber-800 border-amber-200',
  desmarcou: 'bg-gray-100 text-gray-500 border-gray-200',
}
