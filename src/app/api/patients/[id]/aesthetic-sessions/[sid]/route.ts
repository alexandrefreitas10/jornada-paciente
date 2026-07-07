import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { sid } = await params
  await sql`DELETE FROM aesthetic_sessions WHERE id = ${Number(sid)}`
  return NextResponse.json({ ok: true })
}
