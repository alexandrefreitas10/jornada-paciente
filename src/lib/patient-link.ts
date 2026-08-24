import sql from '@/lib/db'
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

  const candidatos = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM patients WHERE deleted_at IS NULL
  `
  return acharPacientePorNome(patientName, candidatos)
}
