// Banco dos avisos (push) do portal. As regras puras ficam em `push.ts`.
import sql, { initSchema } from './db'

export interface Assinatura {
  id: number
  patient_id: number
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Guarda o aparelho do paciente.
 *
 * `ON CONFLICT (endpoint)` porque o mesmo aparelho reassina toda vez que o
 * portal abre: sem isso, cada abertura viraria uma linha nova e o paciente
 * receberia o mesmo aviso repetido.
 */
export async function salvarAssinatura(
  patientId: number,
  a: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await initSchema()
  await sql`
    INSERT INTO push_subscriptions (patient_id, endpoint, p256dh, auth)
    VALUES (${patientId}, ${a.endpoint}, ${a.p256dh}, ${a.auth})
    ON CONFLICT (endpoint) DO UPDATE
      SET patient_id = ${patientId}, p256dh = ${a.p256dh}, auth = ${a.auth}
  `
}

export async function assinaturasDoPaciente(patientId: number): Promise<Assinatura[]> {
  await initSchema()
  return sql<Assinatura[]>`
    SELECT id, patient_id, endpoint, p256dh, auth
    FROM push_subscriptions WHERE patient_id = ${patientId}
  `
}

export async function apagarAssinatura(endpoint: string): Promise<void> {
  await initSchema()
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`
}

/** Quem já aceitou receber aviso — para a tela de teste do lado da clínica. */
export async function pacientesComAviso(): Promise<{ patient_id: number; name: string; aparelhos: number }[]> {
  await initSchema()
  return sql<{ patient_id: number; name: string; aparelhos: number }[]>`
    SELECT s.patient_id, p.name, COUNT(*)::int AS aparelhos
    FROM push_subscriptions s
    JOIN patients p ON p.id = s.patient_id
    GROUP BY s.patient_id, p.name
    ORDER BY p.name
  `
}
