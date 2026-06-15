import { NextRequest, NextResponse } from 'next/server'
import { deleteUser } from '@/lib/users'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  await deleteUser(Number(uid))
  return NextResponse.json({ ok: true })
}
