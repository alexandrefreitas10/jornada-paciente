import { NextRequest, NextResponse } from 'next/server'
import { listMovementsByPatient } from '@/lib/stock'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const movements = await listMovementsByPatient(Number(id))
  return NextResponse.json(movements)
}
