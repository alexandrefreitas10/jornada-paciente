import sql, { initSchema } from '@/lib/db'
import {
  classificar, inicioDaSemanaBrasilia,
  type Etiqueta, type Intervalo, type MarcacaoEnviada, type PacienteEmTratamento,
} from './em-tratamento'

interface Linha {
  patient_id: number
  name: string
  intervalo: number
  ultima_saida: Date | string
  ultima_folha: Date | string | null
  template: Etiqueta | null
  sent_by: string | null
  sent_at: Date | string | null
}

const iso = (d: Date | string) => new Date(d).toISOString()

export async function listarEmTratamento(agora = new Date()): Promise<PacienteEmTratamento[]> {
  await initSchema()
  const semana = inicioDaSemanaBrasilia(agora)

  // Implante fica de fora: é semestral e tem módulo próprio. A observação
  // cobre a tela de Implantes; o nome do item cobre a saída lançada pelo
  // estoque, que não grava essa observação.
  const linhas = await sql<Linha[]>`
    WITH saidas AS (
      SELECT m.patient_id, MAX(m.created_at) AS ultima_saida
      FROM stock_movements m
      JOIN stock_items i ON i.id = m.item_id
      WHERE m.type = 'saida'
        AND m.patient_id IS NOT NULL
        AND COALESCE(m.observation, '') <> 'Implante hormonal'
        AND i.name NOT ILIKE '%implante%'
      GROUP BY m.patient_id
    ),
    folhas AS (
      SELECT patient_id, MAX(created_at) AS ultima_folha
      FROM patient_files
      WHERE file_type = 'prescription' AND deleted_at IS NULL
      GROUP BY patient_id
    )
    SELECT p.id AS patient_id, p.name, p.application_interval_days AS intervalo,
           s.ultima_saida, f.ultima_folha,
           t.template, t.sent_by, t.sent_at
    FROM saidas s
    JOIN patients p
      ON p.id = s.patient_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
    LEFT JOIN folhas f ON f.patient_id = s.patient_id
    LEFT JOIN treatment_messages t
      ON t.patient_id = s.patient_id AND t.week_start = ${semana}::date
  `

  const lista: PacienteEmTratamento[] = []
  for (const l of linhas) {
    const situacao = classificar(
      new Date(l.ultima_saida),
      l.ultima_folha ? new Date(l.ultima_folha) : null,
      agora,
      l.intervalo,
    )
    if (!situacao) continue
    lista.push({
      patientId: l.patient_id,
      nome: l.name,
      ultimaAplicacao: iso(l.ultima_saida),
      ultimaFolha: l.ultima_folha ? iso(l.ultima_folha) : null,
      intervalo: l.intervalo,
      etiqueta: situacao.etiqueta,
      diasSemVir: situacao.diasSemVir,
      diasAguardando: situacao.diasAguardando ?? null,
      enviada: l.template && l.sent_at
        ? { template: l.template, sentBy: l.sent_by, sentAt: iso(l.sent_at) }
        : null,
    })
  }
  return lista
}

/** `null` quando o paciente não existe. */
export async function marcarEnviada(
  patientId: number,
  template: Etiqueta,
  sentBy: string,
  agora = new Date(),
): Promise<MarcacaoEnviada | null> {
  await initSchema()
  const semana = inicioDaSemanaBrasilia(agora)
  try {
    const [r] = await sql<{ template: Etiqueta; sent_by: string | null; sent_at: Date | string }[]>`
      INSERT INTO treatment_messages (patient_id, week_start, template, sent_by)
      VALUES (${patientId}, ${semana}::date, ${template}, ${sentBy})
      ON CONFLICT (patient_id, week_start)
      DO UPDATE SET template = EXCLUDED.template, sent_by = EXCLUDED.sent_by, sent_at = NOW()
      RETURNING template, sent_by, sent_at
    `
    return { template: r.template, sentBy: r.sent_by, sentAt: iso(r.sent_at) }
  } catch (err) {
    // 23503 = violação de chave estrangeira: paciente inexistente.
    if ((err as { code?: string }).code === '23503') return null
    throw err
  }
}

export async function desmarcarEnviada(patientId: number, agora = new Date()): Promise<boolean> {
  await initSchema()
  const semana = inicioDaSemanaBrasilia(agora)
  const resultado = await sql`
    DELETE FROM treatment_messages
    WHERE patient_id = ${patientId} AND week_start = ${semana}::date
  `
  return resultado.count > 0
}

/**
 * Grava o intervalo de aplicação e devolve o anterior (para a auditoria), ou
 * `null` quando o paciente não existe ou foi excluído.
 */
export async function definirIntervalo(patientId: number, intervalo: Intervalo): Promise<number | null> {
  await initSchema()
  const [r] = await sql<{ anterior: number }[]>`
    WITH a AS (
      SELECT application_interval_days AS anterior
      FROM patients
      WHERE id = ${patientId} AND deleted_at IS NULL
      FOR UPDATE
    )
    UPDATE patients SET application_interval_days = ${intervalo}
    WHERE id = ${patientId} AND deleted_at IS NULL
    RETURNING (SELECT anterior FROM a) AS anterior
  `
  return r ? r.anterior : null
}
