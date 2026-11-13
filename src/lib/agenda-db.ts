import sql, { initSchema } from '@/lib/db'
import { DURACOES, type Duracao } from './agenda-grade'

// Gravação e leitura da agenda. Só servidor.
//
// Dia e hora saem do banco como TEXTO (`to_char`), não como `Date`: coluna
// DATE vira meia-noite local e voltar disso para AAAA-MM-DD depende do fuso de
// quem roda o servidor. Texto não tem fuso.

export const STATUS_AGENDAMENTO = ['agendado', 'atendido', 'faltou', 'remarcou', 'desmarcou'] as const
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number]

export function duracaoValida(n: number): n is Duracao {
  return (DURACOES as readonly number[]).includes(n)
}

export function ehStatusAgendamento(s: string): s is StatusAgendamento {
  return (STATUS_AGENDAMENTO as readonly string[]).includes(s)
}

export interface Agendamento {
  id: number
  patient_id: number
  dia: string
  hora: string
  duracao: Duracao
  status: StatusAgendamento
  encaixe: boolean
  criado_por: string | null
  desmarcado_por: string | null
}

export interface BloqueioGravado {
  id: number
  dia: string
  de: string
  ate: string
  motivo: string | null
  criado_por: string | null
}

const COLUNAS_AGENDAMENTO = sql`
  id, patient_id, to_char(dia, 'YYYY-MM-DD') AS dia, to_char(hora, 'HH24:MI') AS hora,
  duracao, status, encaixe, criado_por, desmarcado_por`

export async function criarAgendamento(dados: {
  patientId: number
  dia: string
  hora: string
  duracao: Duracao
  encaixe?: boolean
  criadoPor: string | null
}): Promise<Agendamento> {
  await initSchema()
  // Quem segura a fatia é o índice único parcial, não uma checagem prévia: se
  // outro pedido levou o horário no mesmo segundo, o INSERT estoura (23505) e
  // quem chama traduz isso em "horário ocupado".
  const [linha] = await sql<Agendamento[]>`
    INSERT INTO agendamentos (patient_id, dia, hora, duracao, encaixe, criado_por)
    VALUES (${dados.patientId}, ${dados.dia}::date, ${dados.hora}::time, ${dados.duracao},
            ${dados.encaixe ?? false}, ${dados.criadoPor})
    RETURNING ${COLUNAS_AGENDAMENTO}`
  return linha
}

/** Agendamentos com `de <= dia <= ate` (AAAA-MM-DD, ambos inclusos). */
export async function agendamentosDoPeriodo(de: string, ate: string): Promise<Agendamento[]> {
  await initSchema()
  return sql<Agendamento[]>`
    SELECT ${COLUNAS_AGENDAMENTO} FROM agendamentos
    WHERE dia BETWEEN ${de}::date AND ${ate}::date
    ORDER BY dia, hora, id`
}

/**
 * `por` só é gravado ao desmarcar: é o nome de quem soltou o horário. Nos
 * outros status o campo fica como estava, para não apagar um registro antigo.
 */
export async function mudarStatus(
  id: number,
  status: StatusAgendamento,
  por: string | null,
): Promise<Agendamento | null> {
  await initSchema()
  const [linha] = await sql<Agendamento[]>`
    UPDATE agendamentos
    SET status = ${status},
        desmarcado_por = CASE WHEN ${status}::text = 'desmarcou' THEN ${por} ELSE desmarcado_por END
    WHERE id = ${id}
    RETURNING ${COLUNAS_AGENDAMENTO}`
  return linha ?? null
}

export async function mudarDuracao(id: number, duracao: Duracao): Promise<Agendamento | null> {
  await initSchema()
  const [linha] = await sql<Agendamento[]>`
    UPDATE agendamentos SET duracao = ${duracao} WHERE id = ${id}
    RETURNING ${COLUNAS_AGENDAMENTO}`
  return linha ?? null
}

export async function criarBloqueio(dados: {
  dia: string
  de: string
  ate: string
  motivo?: string | null
  criadoPor: string | null
}): Promise<BloqueioGravado> {
  await initSchema()
  const [linha] = await sql<BloqueioGravado[]>`
    INSERT INTO agenda_bloqueios (dia, de, ate, motivo, criado_por)
    VALUES (${dados.dia}::date, ${dados.de}::time, ${dados.ate}::time,
            ${dados.motivo ?? null}, ${dados.criadoPor})
    RETURNING id, to_char(dia, 'YYYY-MM-DD') AS dia, to_char(de, 'HH24:MI') AS de,
              to_char(ate, 'HH24:MI') AS ate, motivo, criado_por`
  return linha
}

export async function bloqueiosDoPeriodo(de: string, ate: string): Promise<BloqueioGravado[]> {
  await initSchema()
  return sql<BloqueioGravado[]>`
    SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, to_char("de", 'HH24:MI') AS de,
           to_char("ate", 'HH24:MI') AS ate, motivo, criado_por
    FROM agenda_bloqueios
    WHERE dia BETWEEN ${de}::date AND ${ate}::date
    ORDER BY dia, "de", id`
}
