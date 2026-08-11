import sql, { initSchema } from './db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import {
  classificarCodigo, normalizarCodigo, sortearCodigo, VALIDADE_DIAS,
  type EstadoCodigo,
} from './portal-invite-code'
import { logAudit } from './audit'

export interface PatientUser {
  id: number
  patient_id: number
  // O paciente escolhe o e-mail só na ativação por código — a linha nasce sem
  // e-mail, então isso pode ser null até lá (ver gerarCodigoAcesso).
  email: string | null
  password_hash: string | null
  invite_token: string | null
  invite_used_at: string | null
  invite_code: string | null
  invite_expires_at: string | null
  created_at: string
}

export async function findPortalUserByEmail(email: string): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`SELECT * FROM patient_users WHERE email = ${email.toLowerCase().trim()}`
  return row ?? null
}

export async function findPortalUserByPatientId(patientId: number): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`SELECT * FROM patient_users WHERE patient_id = ${patientId}`
  return row ?? null
}

export async function findPortalUserByToken(token: string): Promise<PatientUser | null> {
  await initSchema()
  const [row] = await sql<PatientUser[]>`
    SELECT * FROM patient_users
    WHERE invite_token = ${token}::uuid
      AND invite_used_at IS NULL
  `
  return row ?? null
}

export async function createPortalInvite(patientId: number, email: string): Promise<string> {
  await initSchema()
  const token = randomUUID()
  const normalizedEmail = email.toLowerCase().trim()

  // Transação: e-mail no card e patient_users ficam consistentes (tudo ou nada)
  await sql.begin(async (tx) => {
    await tx`UPDATE patients SET email = ${normalizedEmail} WHERE id = ${patientId}`
    await tx`
      INSERT INTO patient_users (patient_id, email, invite_token, email_registered_at)
      VALUES (${patientId}, ${normalizedEmail}, ${token}::uuid, NOW())
      ON CONFLICT (patient_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        invite_token = EXCLUDED.invite_token,
        invite_used_at = NULL,
        password_hash = NULL,
        email_registered_at = NOW()
    `
  })
  return token
}

export async function activatePortalUser(token: string, password: string): Promise<boolean> {
  await initSchema()
  const user = await findPortalUserByToken(token)
  if (!user) return false

  const hash = await bcrypt.hash(password, 12)
  await sql`
    UPDATE patient_users
    SET password_hash = ${hash},
        invite_token = NULL,
        invite_used_at = NOW()
    WHERE id = ${user.id}
  `
  return true
}

export async function revokePortalAccess(patientId: number): Promise<void> {
  await initSchema()
  await sql.begin(async (tx) => {
    await tx`DELETE FROM patient_users WHERE patient_id = ${patientId}`
    await tx`UPDATE patients SET email = NULL WHERE id = ${patientId}`
  })
}

// Gera (ou regera) o código de acesso de um paciente que JÁ EXISTE no sistema.
// Regerar é também a redefinição de senha: o password_hash é zerado, então o
// paciente obrigatoriamente escolhe uma senha nova ao usar o código.
export async function gerarCodigoAcesso(
  patientId: number
): Promise<{ code: string; expiresAt: string }> {
  await initSchema()
  // Colisão é improvável (27^6 ≈ 387 milhões), mas ON CONFLICT + retry é mais
  // honesto do que torcer: sem isso, uma colisão viraria erro 500 sem sentido.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const code = sortearCodigo()
    const rows = await sql<{ invite_expires_at: string }[]>`
      INSERT INTO patient_users (patient_id, invite_code, invite_expires_at)
      VALUES (${patientId}, ${code}, NOW() + (${VALIDADE_DIAS} || ' days')::interval)
      ON CONFLICT (patient_id) DO UPDATE SET
        invite_code = EXCLUDED.invite_code,
        invite_expires_at = EXCLUDED.invite_expires_at,
        invite_used_at = NULL,
        password_hash = NULL
      RETURNING invite_expires_at
    `.catch(() => [] as { invite_expires_at: string }[])
    if (rows.length > 0) return { code, expiresAt: rows[0].invite_expires_at }
  }
  throw new Error('Não deu pra gerar o código. Tente de novo.')
}

export interface LeituraCodigo {
  estado: EstadoCodigo
  patientName?: string
}

// Lê o estado do código ANTES de o paciente preencher e-mail e senha —
// descobrir que expirou só no envio seria perder todo o preenchimento.
export async function lerCodigoAcesso(bruto: string): Promise<LeituraCodigo> {
  const code = normalizarCodigo(bruto)
  if (!code) return { estado: 'invalido' }
  await initSchema()
  const [row] = await sql<{
    invite_used_at: string | null
    invite_expires_at: string | null
    patient_name: string
  }[]>`
    SELECT u.invite_used_at, u.invite_expires_at, p.name AS patient_name
    FROM patient_users u JOIN patients p ON p.id = u.patient_id
    WHERE u.invite_code = ${code}
  `
  const estado = classificarCodigo(row ?? null)
  return estado === 'valido' ? { estado, patientName: row.patient_name } : { estado }
}

export type ResultadoAtivacao =
  | { ok: true; patientId: number; email: string }
  | { ok: false; motivo: EstadoCodigo | 'email_em_uso' | 'senha_curta' }

export const SENHA_MINIMA = 6

// Ativa a conta e queima o código numa transação só. O SELECT ... FOR UPDATE é
// o que impede dois cliques simultâneos em "ativar" de rodarem duas vezes.
export async function ativarComCodigo(input: {
  code: string
  email: string
  password: string
}): Promise<ResultadoAtivacao> {
  const code = normalizarCodigo(input.code)
  if (!code) return { ok: false, motivo: 'invalido' }
  if (!input.password || input.password.length < SENHA_MINIMA) {
    return { ok: false, motivo: 'senha_curta' }
  }
  const email = input.email.toLowerCase().trim()
  await initSchema()
  const hash = await bcrypt.hash(input.password, 12)

  const resultado = await sql.begin(async (tx) => {
    const [u] = await tx<{
      id: number
      patient_id: number
      invite_used_at: string | null
      invite_expires_at: string | null
    }[]>`
      SELECT id, patient_id, invite_used_at, invite_expires_at
      FROM patient_users WHERE invite_code = ${code} FOR UPDATE
    `
    const estado = classificarCodigo(u ?? null)
    if (estado !== 'valido') return { ok: false, motivo: estado } as ResultadoAtivacao

    // Caso real: casal em que os dois são pacientes e compartilham e-mail.
    // Sem esta checagem o erro sairia como violação de índice, sem explicação.
    const [emUso] = await tx<{ id: number }[]>`
      SELECT id FROM patient_users WHERE email = ${email} AND id <> ${u.id}
    `
    if (emUso) return { ok: false, motivo: 'email_em_uso' } as ResultadoAtivacao

    await tx`
      UPDATE patient_users
      SET email = ${email},
          password_hash = ${hash},
          invite_code = NULL,
          invite_token = NULL,
          invite_used_at = NOW(),
          email_registered_at = NOW()
      WHERE id = ${u.id}
    `
    // O card do paciente também mostra o e-mail — mantém os dois consistentes.
    await tx`UPDATE patients SET email = ${email} WHERE id = ${u.patient_id}`
    return { ok: true, patientId: u.patient_id, email } as ResultadoAtivacao
  })

  // Auditoria fora da transação: registrar não pode derrubar a ativação.
  if (resultado.ok) {
    await logAudit({
      userName: `paciente:${resultado.email}`,
      action: 'portal.codigo.usado',
      entityType: 'patient_user',
      patientId: resultado.patientId,
      details: `Conta do portal ativada por código. E-mail escolhido: ${resultado.email}`,
    }).catch(() => {})
  }
  return resultado
}
