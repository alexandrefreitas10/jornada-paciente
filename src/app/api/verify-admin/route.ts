import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { findAdminUser } from '@/lib/users'
import { assertNotLocked, registerFailure, clearAttempts } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })

  const admin = await findAdminUser()
  if (!admin) return NextResponse.json({ error: 'Administrador não encontrado' }, { status: 404 })

  // Rate-limit por admin (reauth): trava brute-force da senha de admin
  const gate = await assertNotLocked('reauth', admin.username)
  if (gate.blocked) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } }
    )
  }

  const valid = await bcrypt.compare(password, admin.password_hash)
  if (!valid) {
    await registerFailure('reauth', admin.username)
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  }

  await clearAttempts('reauth', admin.username)
  return NextResponse.json({ ok: true })
}
