import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { acharFotoAvulsa } from '@/lib/fotos-db'
import { idDeCaminho } from '@/lib/fotos-regras'
import { getFileStream } from '@/lib/s3'
import { contentTypeSeguro } from '@/lib/tipos-de-imagem'

// Stream pela própria origem, nunca URL assinada: URL assinada expira em 15 min
// e o canvas fica "sujo" com imagem de outro domínio, o que faz `toBlob` lançar
// erro de segurança na hora de gerar a montagem.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id, fid } = await params

  // `idDeCaminho` guarda a regra num lugar só (`fotos-regras.ts`): id não
  // numérico vira `NaN` e id acima do INTEGER do Postgres estoura dentro do
  // banco — os dois virando 500 onde a resposta tem de ser o MESMO 404 do id
  // inexistente, para quem sonda a API não distinguir um do outro.
  const pessoaId = idDeCaminho(id)
  const fotoId = idDeCaminho(fid)
  if (pessoaId == null || fotoId == null) {
    return NextResponse.json({ error: 'Foto não encontrada' }, { status: 404 })
  }

  // A foto tem de pertencer à pasta do caminho (anti-IDOR).
  const foto = await acharFotoAvulsa(fotoId)
  if (!foto || foto.pessoa_id !== pessoaId) {
    return NextResponse.json({ error: 'Foto não encontrada' }, { status: 404 })
  }

  const { body, contentType } = await getFileStream(foto.s3_key)
  return new NextResponse(body, {
    headers: {
      // Servir inline na própria origem é o que torna o Content-Type perigoso:
      // um `image/svg+xml` aqui executaria script com a sessão de quem abriu.
      // Por isso o tipo guardado passa pela lista fechada (fora dela vira
      // `application/octet-stream`, que o navegador baixa em vez de renderizar)
      // e `nosniff` impede o navegador de adivinhar outro tipo pelo conteúdo.
      'Content-Type': contentTypeSeguro(contentType),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="foto"',
      'Cache-Control': 'private, max-age=60',
    },
  })
}
