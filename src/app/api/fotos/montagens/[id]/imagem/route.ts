import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { acharMontagem } from '@/lib/fotos-db'
import { apelidoDeArquivo } from '@/lib/montagem'
import { idDeCaminho } from '@/lib/fotos-regras'
import { getFileStream, getSignedDownloadUrlWithFilename } from '@/lib/s3'
import { contentTypeSeguro } from '@/lib/tipos-de-imagem'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params

  // `idDeCaminho` guarda a regra num lugar só (`fotos-regras.ts`): id não
  // numérico vira `NaN` e id acima do INTEGER do Postgres estoura dentro do
  // banco — os dois virando 500 onde a resposta tem de ser o MESMO 404 do id
  // inexistente, para quem sonda a API não distinguir um do outro.
  const idNumero = idDeCaminho(id)
  if (idNumero == null) {
    return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  }

  const montagem = await acharMontagem(idNumero)
  if (!montagem) return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })

  // ?thumb=1 → a miniatura, em stream da própria origem: a galeria fica aberta
  // mais de 15 minutos e URL assinada venceria com a tela na frente do dono.
  if (req.nextUrl.searchParams.get('thumb') === '1') {
    const { body, contentType } = await getFileStream(montagem.s3_key_thumb)
    // `nosniff` impede o navegador de ignorar o tipo declarado e adivinhar
    // outro a partir do conteúdo. A miniatura é servida INLINE na origem do
    // app: se um SVG tivesse se passado por imagem no upload e o navegador
    // adivinhasse `image/svg+xml`, o script dentro dele rodaria com a sessão de
    // quem está olhando a galeria. O POST confere a assinatura dos bytes; estes
    // dois cabeçalhos são o outro lado da mesma trava — não apague por parecer
    // paranoia.
    //
    // O tipo guardado no S3 também não vai cru para o cabeçalho: passa pela
    // lista fechada e, fora dela, vira `application/octet-stream`, que o
    // navegador baixa em vez de renderizar. Hoje o único escritor desta chave é
    // o nosso POST, que grava `image/jpeg` fixo — mas a rota não depende disso.
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentTypeSeguro(contentType),
        'Content-Disposition': 'inline; filename="antes-depois"',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  // Padrão → baixar o PNG inteiro, com nome de arquivo legível. A regex troca
  // tudo que não é letra nem número por '-', então barra, ponto, CR e LF do
  // nome não chegam ao cabeçalho Content-Disposition nem viram caminho.
  // A extensão vem da CHAVE gravada, não fixa: as montagens guardadas antes de
  // a gravação passar a usar JPEG são PNG, e entregar um .png chamando-o de
  // .jpg (ou o contrário) faz o sistema operacional do dono abrir o arquivo
  // errado — ou recusar abrir.
  const extensao = montagem.s3_key.split('.').pop()?.toLowerCase() || 'jpg'
  const nomeArquivo = `antes-depois-${apelidoDeArquivo(montagem.nome)}.${extensao}`
  const url = await getSignedDownloadUrlWithFilename(montagem.s3_key, nomeArquivo)
  return NextResponse.redirect(url)
}
