import { NextRequest } from 'next/server'
import { deletePatientFile } from '@/lib/patient-files'
import { deleteFile } from '@/lib/s3'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { fid } = await params
  const s3Key = await deletePatientFile(Number(fid))
  await deleteFile(s3Key)
  return new Response(null, { status: 204 })
}
