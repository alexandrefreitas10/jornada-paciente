import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import sql, { initSchema } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { findUserByUsername } from '@/lib/users'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[permanently-delete] Starting...')
    const session = await auth()
    console.log('[permanently-delete] Session:', session?.user?.name)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params
    console.log('[permanently-delete] ID:', id)
    const body = await req.json()
    const { adminPassword } = body
    console.log('[permanently-delete] Has password:', !!adminPassword)

    if (!adminPassword) {
      return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })
    }

    const user = await findUserByUsername(session.user.name)
    console.log('[permanently-delete] User found:', !!user)
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const passwordMatch = await bcrypt.compare(adminPassword, user.password_hash)
    console.log('[permanently-delete] Password match:', passwordMatch)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
    }

    await initSchema()
    console.log('[permanently-delete] Deleting audit log:', id)
    await sql`DELETE FROM audit_logs WHERE id = ${Number(id)}`

    console.log('[permanently-delete] Done!')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/audit/[id]/permanently-delete]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
