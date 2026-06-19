import { NextRequest } from 'next/server'
import { deletePatientTerm } from '@/lib/patient-terms'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const { tid } = await params
  await deletePatientTerm(Number(tid))
  return new Response(null, { status: 204 })
}
