import { NextRequest } from 'next/server'
import { listMeasurements, createMeasurement, deleteAllMeasurements } from '@/lib/measurements'
import { listPatientFiles, deletePatientFile } from '@/lib/patient-files'
import { deleteFile } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const measurements = await listMeasurements(Number(id))
  return Response.json(measurements)
}

// Apaga todas as medições + foto da tabela do paciente
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteAllMeasurements(Number(id))
  const photos = await listPatientFiles(Number(id), 'evolution')
  await Promise.all(photos.map(async (f) => {
    await deleteFile(f.s3_key).catch(() => {})
    await deletePatientFile(f.id)
  }))
  return new Response(null, { status: 204 })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const measurement = await createMeasurement(Number(id), body)
  return Response.json(measurement, { status: 201 })
}
