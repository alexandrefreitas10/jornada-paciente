import { NextRequest, NextResponse } from 'next/server'
import { listUsers, createUser, countUsers } from '@/lib/users'
import { isAdminSession } from '@/lib/authz'

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }
  const users = await listUsers()
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const { username: rawUsername, password } = await req.json()
  const username = (rawUsername ?? '').trim()

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const count = await countUsers()
  // Bootstrap: o primeiro usuário (setup) é criado sem sessão; depois disso,
  // criar usuário exige admin.
  if (count > 0 && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }
  if (count >= 10) {
    return NextResponse.json({ error: 'Limite de 10 usuários atingido' }, { status: 400 })
  }

  try {
    const user = await createUser(username, password)
    return NextResponse.json(user, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Usuário já existe' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
