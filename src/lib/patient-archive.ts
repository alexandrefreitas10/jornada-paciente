import sql, { initSchema } from './db'

export type OrigemArquivamento = 'em_tratamento' | 'card_paciente'
export type OrigemReativacao = 'pacientes_antigos'

/**
 * Arquiva e registra o motivo numa transação. `false` quando não há o que
 * arquivar: paciente inexistente, excluído ou já arquivado.
 */
export async function arquivarPaciente(
  id: number,
  motivo: string,
  por: string,
  origem: OrigemArquivamento,
): Promise<boolean> {
  await initSchema()
  return sql.begin(async (tx) => {
    const [paciente] = await tx<{ id: number }[]>`
      UPDATE patients SET archived_at = NOW()
      WHERE id = ${id} AND archived_at IS NULL AND deleted_at IS NULL
      RETURNING id
    `
    if (!paciente) return false
    await tx`
      INSERT INTO patient_archive_events (patient_id, action, reason, source, created_by)
      VALUES (${id}, 'arquivado', ${motivo}, ${origem}, ${por})
    `
    return true
  })
}

/**
 * Reativa pela tela de Pacientes Antigos. `false` quando o paciente não está
 * arquivado (ou não existe). A reativação automática por nova aplicação fica
 * em createMovement, dentro da transação da saída.
 */
export async function reativarPaciente(
  id: number,
  por: string,
  origem: OrigemReativacao,
): Promise<boolean> {
  await initSchema()
  return sql.begin(async (tx) => {
    const [paciente] = await tx<{ id: number }[]>`
      UPDATE patients SET archived_at = NULL
      WHERE id = ${id} AND archived_at IS NOT NULL AND deleted_at IS NULL
      RETURNING id
    `
    if (!paciente) return false
    await tx`
      INSERT INTO patient_archive_events (patient_id, action, source, created_by)
      VALUES (${id}, 'reativado', ${origem}, ${por})
    `
    return true
  })
}
