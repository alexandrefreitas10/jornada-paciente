import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { portalAuth } from '@/auth-portal'
import { acharMontagem } from '@/lib/fotos-db'
import { idDeCaminho, podeVerMontagem } from '@/lib/fotos-regras'
import { apelidoDeArquivo } from '@/lib/montagem'
import { getFileStream, getSignedDownloadUrlWithFilename } from '@/lib/s3'
import { contentTypeSeguro } from '@/lib/tipos-de-imagem'

// A montagem antes-e-depois vista pelo PACIENTE, no portal — e também pela
// equipe, que chega pelo mesmo caminho.
//
// Mora sob `/api/patients/[id]/` porque é o único prefixo que o `proxy.ts`
// libera para sessão de portal (GET do próprio id). A rota da equipe
// (`/api/fotos/montagens/...`) exige `auth()` e é inalcançável para o paciente.
//
// `?thumb=1` = miniatura em stream; `?proxy=1` = imagem inteira em stream, para
// exibir; sem parâmetro = download com nome de arquivo. É o mesmo vocabulário
// de `/api/patients/[id]/files/[fid]/download`, que a tela de fotos do portal
// já usa — duas rotas irmãs com nomes diferentes para a mesma ideia seria
// armadilha para quem mexer depois.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const { id, mid } = await params
  const patientId = idDeCaminho(id)
  const montagemId = idDeCaminho(mid)
  if (patientId == null || montagemId == null) {
    return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  }

  // Confere a sessão aqui, além do middleware: equipe vê qualquer paciente,
  // paciente vê só a si mesmo. Confiar só no `proxy.ts` seria confiar numa
  // linha de configuração de rota que ninguém relê — e o que está em jogo aqui
  // é a foto do corpo de uma pessoa.
  const equipe = await auth()
  if (!equipe?.user) {
    const portal = await portalAuth()
    const doPortal = (portal?.user as { patient_id?: number | string } | undefined)?.patient_id
    if (doPortal == null || Number(doPortal) !== patientId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  }

  const montagem = await acharMontagem(montagemId)
  // Mesma resposta para "não existe" e "não é sua": de fora, as duas têm de ser
  // indistinguíveis, senão trocar o número na URL vira um jeito de descobrir
  // quais montagens existem.
  if (!podeVerMontagem(montagem, patientId)) {
    return NextResponse.json({ error: 'Montagem não encontrada' }, { status: 404 })
  }

  const inteira = req.nextUrl.searchParams.get('proxy') === '1'
  const miniatura = req.nextUrl.searchParams.get('thumb') === '1'

  if (inteira || miniatura) {
    const { body, contentType } = await getFileStream(
      miniatura ? montagem.s3_key_thumb : montagem.s3_key,
    )
    return new NextResponse(body, {
      headers: {
        // Nunca o tipo cru do S3: imagem servida inline na origem do app com um
        // tipo executável roda script com a sessão de quem abriu.
        'Content-Type': contentTypeSeguro(contentType),
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="antes-depois"',
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  // A extensão vem da CHAVE gravada: as montagens anteriores à mudança para
  // JPEG são PNG, e entregar uma chamando-a de .jpg faz o celular do paciente
  // abrir o arquivo errado.
  const extensao = montagem.s3_key.split('.').pop()?.toLowerCase() || 'jpg'
  const url = await getSignedDownloadUrlWithFilename(
    montagem.s3_key,
    `antes-depois-${apelidoDeArquivo(montagem.nome)}.${extensao}`,
  )
  return NextResponse.redirect(url)
}
