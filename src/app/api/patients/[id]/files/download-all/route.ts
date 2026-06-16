import { NextRequest, NextResponse } from 'next/server'
import { listPatientFiles, FileType } from '@/lib/patient-files'
import { getFileStream } from '@/lib/s3'
import { zipSync, strToU8 } from 'fflate'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const fileType = req.nextUrl.searchParams.get('type') as FileType | null

  if (!fileType) {
    return NextResponse.json({ error: 'Tipo não informado' }, { status: 400 })
  }

  const files = await listPatientFiles(Number(id), fileType)

  if (files.length === 0) {
    return NextResponse.json({ error: 'Nenhum arquivo encontrado' }, { status: 404 })
  }

  // Busca todos os arquivos do S3 em paralelo
  const entries = await Promise.all(
    files.map(async (f) => {
      const { body } = await getFileStream(f.s3_key)
      const reader = body.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const data = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
      return { name: f.original_name, data }
    })
  )

  // Garante nomes únicos no ZIP
  const seen: Record<string, number> = {}
  const zipFiles: Record<string, Uint8Array> = {}
  for (const { name, data } of entries) {
    const key = seen[name] !== undefined ? `${seen[name]}_${name}` : name
    seen[name] = (seen[name] ?? 0) + 1
    zipFiles[key] = data
  }

  const zip = zipSync(zipFiles)

  const typeLabel: Record<FileType, string> = {
    photo: 'fotos',
    bioimpedance: 'bioimpedancia',
    exam: 'exames',
    diet: 'dietas',
  }

  return new NextResponse(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${typeLabel[fileType]}-paciente-${id}.zip"`,
    },
  })
}
