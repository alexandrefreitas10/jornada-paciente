import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import sql, { initSchema } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { findUserByUsername } from '@/lib/users'
import { deleteFile } from '@/lib/s3'
import { assertNotLocked, registerFailure, clearAttempts } from '@/lib/rate-limit'
import { logSystemError } from '@/lib/system-errors'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    // Exclusão permanente de auditoria é ação de admin — o reauth abaixo é
    // segundo fator, não substitui o papel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(session.user as any).is_admin) {
      return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
    }

    const { logId } = await params
    const body = await req.json()
    const { adminPassword } = body

    if (!adminPassword) {
      return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })
    }

    const user = await findUserByUsername(session.user.name)
    if (!user || !user.is_admin) {
      return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
    }

    // Rate-limit por admin (reauth): trava brute-force da senha
    const gate = await assertNotLocked('reauth', user.username)
    if (gate.blocked) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos.' },
        { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } }
      )
    }

    const passwordMatch = await bcrypt.compare(adminPassword, user.password_hash)
    if (!passwordMatch) {
      await registerFailure('reauth', user.username)
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
    }
    await clearAttempts('reauth', user.username)

    await initSchema()

    // Get the log data before deleting to handle file cleanup
    const [log] = await sql<any>`SELECT * FROM audit_logs WHERE id = ${Number(logId)}`

    // Delete S3 files if applicable
    if (log && log.deleted_data) {
      const data = typeof log.deleted_data === 'string' ? JSON.parse(log.deleted_data) : log.deleted_data
      if (data.file_s3_key && (log.entity_type === 'term' || log.entity_type === 'file')) {
        await deleteFile(data.file_s3_key).catch(err =>
          logSystemError('s3_delete', 'arquivo nao removido do S3 (orfao)', {
            entityType: log.entity_type,
            entityId: String(log.id),
            s3Key: data.file_s3_key,
            code: err instanceof Error ? err.message : String(err),
          })
        )
      }
    }

    await sql`DELETE FROM audit_logs WHERE id = ${Number(logId)}`

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/audit/[logId]/permanently-delete]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
