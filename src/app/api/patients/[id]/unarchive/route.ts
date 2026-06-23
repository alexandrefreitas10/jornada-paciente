import { NextRequest, NextResponse } from 'next/server'
import { unarchivePatient } from '@/lib/patients'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await unarchivePatient(Number(id))
  return NextResponse.json({ ok: true })
}
