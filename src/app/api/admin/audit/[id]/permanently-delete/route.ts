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
    const session = await auth()
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params
    const { adminPassword } = await req.json()

    if (!adminPassword) {
      return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })
    }

    const user = await findUserByUsername(session.user.name)
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const passwordMatch = await bcrypt.compare(adminPassword, user.password_hash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
    }

    await initSchema()
    await sql`DELETE FROM audit_logs WHERE id = ${Number(id)}`

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/audit/[id]/permanently-delete]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
