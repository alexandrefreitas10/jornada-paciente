import { NextRequest } from 'next/server'
import { updateMeasurement, deleteMeasurement } from '@/lib/measurements'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { mid } = await params
  const body = await req.json()
  const measurement = await updateMeasurement(Number(mid), body)
  return Response.json(measurement)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { mid } = await params
  await deleteMeasurement(Number(mid))
  return new Response(null, { status: 204 })
}
