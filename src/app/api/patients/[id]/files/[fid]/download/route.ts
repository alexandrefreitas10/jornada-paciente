import { NextRequest, NextResponse } from 'next/server'
import { getFileById } from '@/lib/patient-files'
import { ownsResource } from '@/lib/authz'
import { getSignedDownloadUrlWithFilename, getFileStream } from '@/lib/s3'
import { cabecalhosDeArquivo, espiarInicio } from '@/lib/entrega-de-arquivo'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const file = await getFileById(Number(fid))
  // Anti-IDOR: o arquivo tem que pertencer ao paciente do path
  if (!ownsResource(file, Number(id))) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  // ?proxy=1 → stream direto (usado pelo canvas para evitar CORS)
  if (req.nextUrl.searchParams.get('proxy') === '1') {
    const { body } = await getFileStream(file.s3_key)

    // O Content-Type GRAVADO no S3 não é usado: ele veio do cliente no upload,
    // e há arquivo antigo gravado com tipo arbitrário — inclusive foto cujo
    // `file.type` chegou vazio do celular. Quem decide são os bytes.
    //
    // Isto é servido INLINE na PRÓPRIA ORIGEM do sistema, que é o que torna o
    // tipo perigoso: um `image/svg+xml` aqui executaria o script de dentro do
    // SVG com a sessão de quem abriu — escalada de um login da equipe para o
    // do dono. Ver `entrega-de-arquivo.ts`.
    const { primeirosBytes, corpo } = await espiarInicio(body)
    return new NextResponse(corpo, {
      headers: {
        ...cabecalhosDeArquivo(primeirosBytes, file.original_name),
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  // padrão → redirect para URL assinada com Content-Disposition
  const url = await getSignedDownloadUrlWithFilename(file.s3_key, file.original_name)
  return NextResponse.redirect(url)
}
