import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/authz'
import { loadOwnedSession, withoutCost } from '@/lib/training/guard'
import { listMessages } from '@/lib/training/sessions'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await loadOwnedSession(Number(id))
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const messages = await listMessages(result.session.id)
  const isAdmin = await isAdminSession()
  return NextResponse.json({
    session: isAdmin ? result.session : withoutCost(result.session),
    messages,
    isAdmin,
  })
}
