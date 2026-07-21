import { NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DIAGNÓSTICO TEMPORÁRIO — inspeciona os acessos ao portal e seus timestamps
// para entender por que a lista de "e-mail do portal cadastrado" não bate.
// REMOVER depois de diagnosticar. Só leitura; protegido pelo middleware admin.
export async function GET() {
  await initSchema()

  const [meta] = await sql<{ now: string; tz: string }[]>`
    SELECT NOW()::text AS now, current_setting('timezone') AS tz
  `

  const rows = await sql<{
    name: string
    email: string
    created_at: string
    email_registered_at: string | null
    invite_used_at: string | null
    card_created_at: string
  }[]>`
    SELECT p.name, pu.email,
           pu.created_at::text            AS created_at,
           pu.email_registered_at::text   AS email_registered_at,
           pu.invite_used_at::text        AS invite_used_at,
           p.created_at::text             AS card_created_at
    FROM patient_users pu
    JOIN patients p ON p.id = pu.patient_id
    ORDER BY pu.created_at DESC NULLS LAST
    LIMIT 30
  `

  return NextResponse.json({ meta, count: rows.length, rows })
}
