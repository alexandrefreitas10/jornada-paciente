import { NextRequest, NextResponse } from 'next/server'
import { archivePatient } from '@/lib/patients'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await archivePatient(Number(id))
  return NextResponse.json({ ok: true })
}
