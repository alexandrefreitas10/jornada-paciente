import { NextRequest } from 'next/server'
import { generateSignToken } from '@/lib/patient-terms'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const { tid } = await params
  const term = await generateSignToken(Number(tid))
  return Response.json(term)
}
