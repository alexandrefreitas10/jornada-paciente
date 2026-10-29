import sql, { initSchema } from './db'
import type { SessaoEstetica } from './estetica-relatorio'

// A consulta da aba Relatórios › Estética. Uma ida ao banco; agrupar por
// procedimento é trabalho da função pura (`estetica-relatorio.ts`), onde a
// regra pode ser testada sem banco.

export async function listarSessoesEstetica(): Promise<SessaoEstetica[]> {
  await initSchema()
  return sql<SessaoEstetica[]>`
    SELECT
      s.id,
      s.patient_id          AS "patientId",
      p.name                AS "patientName",
      s.procedure_name      AS procedimento,
      s.total_sessions      AS "totalSessoes",
      COUNT(c.id)::int      AS feitas,
      s.start_date          AS inicio,
      MAX(c.completed_at)   AS "ultimaFeita",
      s.sessions_per_week,
      s.intervalo_valor,
      s.intervalo_unidade
    FROM aesthetic_sessions s
    JOIN patients p ON p.id = s.patient_id
    LEFT JOIN aesthetic_session_completions c ON c.aesthetic_session_id = s.id
    -- Paciente apagado ou arquivado sai do relatório: a aba existe para cobrar
    -- sessão de quem ainda é paciente da clínica.
    WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
    GROUP BY s.id, p.name
  `
}
