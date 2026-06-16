import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { findUserByUsername } from '@/lib/users'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })

  const admin = await findUserByUsername('038.069.291-06')
  if (!admin) return NextResponse.json({ error: 'Administrador não encontrado' }, { status: 404 })

  const valid = await bcrypt.compare(password, admin.password_hash)
  if (!valid) return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })

  return NextResponse.json({ ok: true })
}
