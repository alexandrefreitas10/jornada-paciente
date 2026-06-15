import { NextRequest, NextResponse } from 'next/server'
import { listUsers, createUser, countUsers } from '@/lib/users'

export async function GET() {
  const users = await listUsers()
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const count = await countUsers()
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
