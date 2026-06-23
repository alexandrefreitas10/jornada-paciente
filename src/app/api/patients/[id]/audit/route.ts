import { NextRequest, NextResponse } from 'next/server'
import { getAuditLogs } from '@/lib/audit'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const logs = await getAuditLogs(Number(id))
  return NextResponse.json(logs)
}
