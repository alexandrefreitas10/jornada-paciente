import sql, { initSchema } from '@/lib/db'
import { acharPacientePorNome } from './patient-match'

/**
 * Decide a qual paciente um registro pertence.
 *
 * Existe porque `patient_id` era tratado como verdade congelada: a renovação
 * de implante copiava o id do registro anterior, e um nulo tirado quando a
 * pessoa ainda não era paciente ia sendo repassado para todo implante e toda
 * saída de estoque seguinte. O nome continuava certo o tempo todo — então
 * quando só o nome vem, vale reconsultar o cadastro em vez de desistir.
 *
 * Não exclui arquivados: paciente arquivado continua sendo a pessoa certa.
 */
export async function resolverPacienteId(
  patientId: number | string | null | undefined,
  patientName: string | null | undefined,
): Promise<number | null> {
  if (patientId) return Number(patientId)
  if (!patientName?.trim()) return null

  // Depois das duas saídas rápidas, que não tocam o banco: só migra quem
  // realmente vai consultar.
  //
  // Faltava aqui, e um dos dois chamadores não cobria a falta. Em
  // `/api/implants` o `initSchema()` da rota vem antes. Em
  // `/api/estoque/movements` NÃO: esta função é avaliada como ARGUMENTO do
  // `createMovement`, então roda antes do `initSchema()` que ele faz por
  // dentro. Num banco novo, lançar movimentação de estoque com nome de
  // paciente era a primeira consulta do processo.
  await initSchema()

  const candidatos = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM patients WHERE deleted_at IS NULL
  `
  return acharPacientePorNome(patientName, candidatos)
}
