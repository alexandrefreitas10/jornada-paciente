import sql, { initSchema } from '@/lib/db'
import { DURACOES, type Duracao } from './agenda-grade'
import { atingidosPeloBloqueio } from './agenda-vagas'
import { logSystemError } from './system-errors'

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

/**
 * Nome do índice único parcial de db.ts. Mora aqui, ao lado de quem o descreve,
 * para o chamador não depender de uma string solta que o tsc não confere.
 */
export const INDICE_FATIA = 'agendamento_fatia_viva'

/**
 * Reconhece a violação (23505) DESTE índice: a fatia já foi tomada por outro
 * agendamento vivo. É situação normal de negócio ("horário já ocupado"), não
 * falha — quem grava deve traduzir em resposta amigável, não deixar virar 500.
 * 23505 de outra constraint, ou qualquer outro erro, dá `false`.
 */
export function ehFatiaOcupada(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const e = erro as { code?: unknown; constraint_name?: unknown }
  return e.code === '23505' && e.constraint_name === INDICE_FATIA
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
  // quem chama usa `ehFatiaOcupada` para traduzir em "horário ocupado".
  const [linha] = await sql<Agendamento[]>`
    INSERT INTO agendamentos (patient_id, dia, hora, duracao, encaixe, criado_por)
    VALUES (${dados.patientId}, ${dados.dia}::date, ${dados.hora}::time, ${dados.duracao},
            ${dados.encaixe ?? false}, ${dados.criadoPor})
    RETURNING ${COLUNAS_AGENDAMENTO}`
  return linha
}

/** Agendamento + nome do paciente, para a tela montar a grade sem outra consulta. */
export interface AgendamentoComNome extends Agendamento {
  nome: string
}

/**
 * Agendamentos com `de <= dia <= ate` (AAAA-MM-DD, ambos inclusos).
 *
 * O nome vem do JOIN, de propósito: a alternativa era o navegador baixar a lista
 * inteira de pacientes só para rotular a grade de um dia, e isso é dado de saúde
 * viajando à toa. LEFT JOIN para que um paciente removido não faça o
 * agendamento sumir da tela; a pessoa continua marcada.
 */
export async function agendamentosDoPeriodo(de: string, ate: string): Promise<AgendamentoComNome[]> {
  await initSchema()
  return sql<AgendamentoComNome[]>`
    SELECT a.id, a.patient_id, to_char(a.dia, 'YYYY-MM-DD') AS dia, to_char(a.hora, 'HH24:MI') AS hora,
           a.duracao, a.status, a.encaixe, a.criado_por, a.desmarcado_por,
           COALESCE(p.name, '(paciente removido)') AS nome
    FROM agendamentos a
    LEFT JOIN patients p ON p.id = a.patient_id
    WHERE a.dia BETWEEN ${de}::date AND ${ate}::date
    ORDER BY a.dia, a.hora, a.id`
}

/**
 * `por` só é gravado ao desmarcar: é o nome de quem soltou o horário. Nos
 * outros status o campo fica como estava, para não apagar um registro antigo.
 *
 * Também pode estourar 23505 (`ehFatiaOcupada`): reviver uma linha
 * `remarcou`/`desmarcou` para `agendado` quando a fatia foi retomada por outro
 * nesse meio tempo.
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
        -- Só grava a autoria na PRIMEIRA desmarcação. Desmarcar o que já está
        -- desmarcado sobrescreveria quem soltou a vaga primeiro — e é
        -- justamente esse nome que responde "quem tirou o paciente da agenda?"
        -- meses depois. O segundo clique não acrescenta informação; apaga.
        desmarcado_por = CASE
          WHEN ${status}::text = 'desmarcou' AND desmarcado_por IS NULL THEN ${por}
          ELSE desmarcado_por
        END
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
}, executor: Executor = sql): Promise<BloqueioGravado> {
  await initSchema()
  const [linha] = await executor<BloqueioGravado[]>`
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

// `sql` ou a transação (`tx`): ambos aceitam template tag.
type Executor = typeof sql

export interface Desmarcado {
  id: number
  patientId: number
  nome: string
  hora: string
  duracao: Duracao
}

/**
 * Grava o bloqueio e desmarca quem estava dentro dele, numa transação só. Sem
 * ela, uma falha no meio deixaria a sala fechada com paciente ainda marcado, e
 * repetir o pedido duplicaria o bloqueio. Só há dois desfechos: bloqueio +
 * todos desmarcados, ou nada.
 * `desmarcado_por` vira "clínica — <nome>": o prefixo distingue do paciente que
 * desmarca sozinho, e o nome responde depois quem decidiu fechar a sala. Sem
 * nome, grava só "clínica" em vez de quebrar.
 * Devolve quem foi derrubado: é a lista que a equipe usa para avisar no WhatsApp.
 */
export async function bloquearEDesmarcar(dados: {
  dia: string
  de: string
  ate: string
  motivo?: string | null
  criadoPor: string | null
}): Promise<{ bloqueio: BloqueioGravado; desmarcados: Desmarcado[] }> {
  await initSchema()
  const nomeFuncionario = dados.criadoPor?.trim()
  const desmarcadoPor = nomeFuncionario ? `clínica — ${nomeFuncionario}` : 'clínica'
  const derrubar = async (tx: Executor) => {
    // Só agendado/atendido segura horário. FOR UPDATE segura só as linhas que
    // JÁ EXISTEM (ninguém muda o status delas no meio). NÃO impede um agendamento
    // novo de entrar na janela bloqueada: trava de linha não é trava de predicado.
    // Por isso há a varredura depois do commit, abaixo. Fora de transação este
    // FOR UPDATE não faz nada (a trava solta no fim do SELECT); fica só porque
    // a função é a mesma. Quem protege lá é o filtro de status do UPDATE.
    // O `status IN` abaixo é a cópia SQL de `vivo()` em agenda-grade.ts (SQL não chama TS).
    const vivos = await tx<Agendamento[]>`
      SELECT ${COLUNAS_AGENDAMENTO} FROM agendamentos
      WHERE dia = ${dados.dia}::date AND status IN ('agendado', 'atendido')
      ORDER BY hora, id FOR UPDATE`
    const ids = atingidosPeloBloqueio({ dia: dados.dia, de: dados.de, ate: dados.ate }, vivos)
    if (ids.length === 0) return []
    // O filtro de status repete a condição do SELECT: na varredura não há trava
    // segurando a linha, e sem ele um 'faltou' marcado nesse meio tempo seria
    // atropelado. Só conta como derrubado quem o UPDATE de fato mudou.
    const mudadas = await tx<{ id: number }[]>`
      UPDATE agendamentos SET status = 'desmarcou', desmarcado_por = ${desmarcadoPor}
      WHERE id = ANY(${ids}::int[]) AND status IN ('agendado', 'atendido')
      RETURNING id`
    const feitos = new Set(mudadas.map((m) => m.id))
    const atingidos = vivos.filter((a) => feitos.has(a.id))
    if (atingidos.length === 0) return []
    const nomes = new Map<number, string>()
    const linhas = await tx<{ id: number; name: string }[]>`
      SELECT id, name FROM patients WHERE id = ANY(${atingidos.map((a) => a.patient_id)}::int[])`
    for (const l of linhas) nomes.set(l.id, l.name)
    return atingidos.map((a) => ({
      id: a.id,
      patientId: a.patient_id,
      nome: nomes.get(a.patient_id) ?? '(paciente removido)',
      hora: a.hora,
      duracao: a.duracao,
    }))
  }
  const { bloqueio, desmarcados } = await sql.begin(async (tx) => {
    const bloqueio = await criarBloqueio(dados, tx as unknown as Executor)
    return { bloqueio, desmarcados: await derrubar(tx as unknown as Executor) }
  })
  // Varredura depois do commit: um POST /api/agenda que leu os bloqueios ANTES
  // de este existir pode ter inserido dentro da janela. Sem derrubar e listar
  // esse paciente, a sala fica fechada com gente marcada e a equipe não sabe
  // quem avisar. Não fecha a janela por completo (o INSERT ainda pode cair
  // depois daqui), mas a reduz de segundos para milissegundos.
  // Se a varredura falhar, o bloqueio e a primeira passagem JÁ estão gravados:
  // devolve a lista parcial, porque os nomes são o que a equipe precisa na mão.
  let retardatarios: Desmarcado[] = []
  try {
    retardatarios = await derrubar(sql)
  } catch (erro) {
    // Vai para a tela de Erros (que a clínica abre), não para o log do servidor:
    // quem a varredura desmarcou antes de falhar fica fora da lista, e só
    // alguém saber disso permite avisar o paciente. Sem nome de paciente.
    await logSystemError('agenda.bloqueio.varredura-falhou', erro instanceof Error ? erro.message : String(erro), {
      dia: dados.dia,
      de: dados.de,
      ate: dados.ate,
      bloqueioId: bloqueio.id,
    })
  }
  return { bloqueio, desmarcados: [...desmarcados, ...retardatarios] }
}
