import { NextRequest } from 'next/server'
import { deletePatientTerm } from '@/lib/patient-terms'
import { deleteFile } from '@/lib/s3'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const { tid } = await params
  const { file_s3_key } = await deletePatientTerm(Number(tid))
  if (file_s3_key) await deleteFile(file_s3_key).catch(() => {})
  return new Response(null, { status: 204 })
}
