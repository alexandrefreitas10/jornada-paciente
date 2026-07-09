import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminListNps, adminListFeedback } from '@/lib/feedback'

export const dynamic = 'force-dynamic'

// GET — todos os NPS e relatos de ouvidoria (somente admin)
export async function GET() {
  const session = await auth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAdmin = !!(session?.user as any)?.is_admin
  if (!isAdmin) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const [nps, feedbacks] = await Promise.all([adminListNps(), adminListFeedback()])
  return NextResponse.json({ nps, feedbacks })
}
