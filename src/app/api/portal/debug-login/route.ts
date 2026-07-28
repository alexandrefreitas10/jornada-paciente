import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DIAGNÓSTICO TEMPORÁRIO — inspeciona o estado do acesso ao portal de um e-mail
// para entender o "senha incorreta". Só leitura, NÃO expõe o hash. Protegido pelo
// middleware admin. REMOVER após diagnosticar.
export async function GET(req: NextRequest) {
  await initSchema()
  const raw = req.nextUrl.searchParams.get('email')
  if (!raw) return NextResponse.json({ error: 'email é obrigatório' }, { status: 400 })
  const email = raw.toLowerCase().trim()

  const users = await sql<{
    patient_id: number
    email: string
    has_password: boolean
    hash_prefix: string | null
    invite_token_present: boolean
    invite_used_at: string | null
    created_at: string
  }[]>`
    SELECT patient_id, email,
           (password_hash IS NOT NULL) AS has_password,
           LEFT(password_hash, 7)      AS hash_prefix,
           (invite_token IS NOT NULL)  AS invite_token_present,
           invite_used_at::text        AS invite_used_at,
           created_at::text            AS created_at
    FROM patient_users
    WHERE email = ${email}
  `

  const [rate] = await sql<{ fail_count: number; locked_until: string | null; retry: number | null }[]>`
    SELECT fail_count, locked_until::text AS locked_until,
           CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())))::int AS retry
    FROM login_attempts
    WHERE scope = 'portal' AND identifier = ${email}
  `

  const [meta] = await sql<{ now: string }[]>`SELECT NOW()::text AS now`

  return NextResponse.json({
    searchedEmail: email,
    now: meta?.now,
    userCount: users.length,
    users,
    rateLimit: rate
      ? { fail_count: rate.fail_count, locked_until: rate.locked_until, blocked: !!rate.locked_until && !!rate.retry && rate.retry > 0, retryAfterSec: rate.retry }
      : { fail_count: 0, blocked: false },
  })
}
