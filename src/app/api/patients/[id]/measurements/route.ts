import { NextRequest } from 'next/server'
import { listMeasurements, createMeasurement } from '@/lib/measurements'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const measurements = await listMeasurements(Number(id))
  return Response.json(measurements)
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
