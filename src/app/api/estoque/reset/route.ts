import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import bcrypt from 'bcryptjs'
import sql from '@/lib/db'
import { findAdminUser } from '@/lib/users'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!(session?.user as { is_admin?: boolean } | undefined)?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })

  const admin = await findAdminUser()
  if (!admin) return NextResponse.json({ error: 'Admin não encontrado' }, { status: 500 })

  const valid = await bcrypt.compare(password, admin.password_hash)
  if (!valid) return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })

  // Transação: os dois DELETE são atômicos (não deixa itens órfãos se cair no meio)
  await sql.begin(async (tx) => {
    await tx`DELETE FROM stock_movements`
    await tx`DELETE FROM stock_items`
  })

  return NextResponse.json({ ok: true })
}
