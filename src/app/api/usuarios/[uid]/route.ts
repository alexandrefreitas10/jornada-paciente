import { NextRequest, NextResponse } from 'next/server'
import { deleteUser, updateUsername, updatePassword, setCanEstoque } from '@/lib/users'

type Params = { params: Promise<{ uid: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { uid } = await params
  const body = await req.json()

  if (body.username !== undefined) {
    if (!body.username?.trim()) {
      return NextResponse.json({ error: 'Login não pode estar vazio' }, { status: 400 })
    }
    try {
      const user = await updateUsername(Number(uid), body.username.trim())
      return NextResponse.json(user)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Esse login já está em uso' }, { status: 409 })
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  if (body.password !== undefined) {
    if (!body.password || body.password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }
    await updatePassword(Number(uid), body.password)
    return NextResponse.json({ ok: true })
  }

  if (body.can_estoque !== undefined) {
    await setCanEstoque(Number(uid), !!body.can_estoque)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { uid } = await params
  await deleteUser(Number(uid))
  return NextResponse.json({ ok: true })
}
