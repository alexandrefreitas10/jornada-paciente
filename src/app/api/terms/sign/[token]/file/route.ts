import { NextRequest, NextResponse } from 'next/server'
import { getTermByToken } from '@/lib/patient-terms'
import { getFileStream } from '@/lib/s3'
import { cabecalhosDeArquivo, espiarInicio } from '@/lib/entrega-de-arquivo'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const term = await getTermByToken(token)
    if (!term) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 })

    // After signing: serve the signed PDF; before signing: serve original
    const signed = req.nextUrl.searchParams.get('signed') === '1'
    const s3Key = (signed && term.signed_file_s3_key) ? term.signed_file_s3_key : term.file_s3_key
    const fileName = term.file_name || `termo-${token}.pdf`

    if (!s3Key) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    }

    const { body } = await getFileStream(s3Key)

    // Mesma trava das rotas de arquivo de paciente, e aqui ela pesa mais: esta
    // rota é alcançável SEM LOGIN — o token basta, e o middleware a libera.
    // Servia o Content-Type gravado no S3, inline, na nossa origem, então um
    // termo gravado como `image/svg+xml` executaria script no navegador de
    // quem abrisse o link para assinar.
    //
    // O nome do arquivo também entrava cru no cabeçalho; um CR/LF em
    // `file_name` injetava cabeçalho. `cabecalhosDeArquivo` higieniza.
    //
    // PDF continua inline porque a página de assinatura o mostra num
    // `<iframe>`: sem isso o paciente não leria o termo antes de assinar.
    const { primeirosBytes, corpo } = await espiarInicio(body)
    return new NextResponse(corpo, {
      headers: { ...cabecalhosDeArquivo(primeirosBytes, fileName) },
    })
  } catch (err) {
    console.error('[download file error]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
