import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'
import { acharPessoa, criarFotoAvulsa, listarFotosAvulsas } from '@/lib/fotos-db'
import { idDeCaminho } from '@/lib/fotos-regras'
import { deleteFile, uploadFile } from '@/lib/s3'
import {
  FORMATOS_ACEITOS,
  extensaoDoTipo,
  tipoDeImagemDeclarado,
  tipoDeImagemDosBytes,
} from '@/lib/tipos-de-imagem'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params

  // `idDeCaminho` (e não `Number()`) porque id malformado vira `NaN` e id acima
  // do INTEGER do Postgres estoura dentro do banco — os dois virando 500 onde a
  // resposta tem de ser o MESMO 404 do id inexistente.
  const pessoaId = idDeCaminho(id)
  if (pessoaId == null) {
    return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
  }

  return NextResponse.json(await listarFotosAvulsas(pessoaId))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params

  // Mesmo 404 do GET: id malformado e id inexistente não podem ser
  // distinguíveis, nem mudar de status entre os dois métodos do mesmo caminho.
  const pessoaId = idDeCaminho(id)
  if (pessoaId == null) {
    return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
  }

  // Corpo malformado ou truncado (conexão caindo no meio do upload) faz o
  // `formData()` lançar; sem isto é 500 vazio na cara de quem só perdeu sinal.
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error('Erro ao ler o formulário da foto:', err)
    return NextResponse.json({ error: 'Não foi possível ler o arquivo enviado' }, { status: 400 })
  }

  // `instanceof Blob` e não um cast `as File`: o cast engana o TypeScript e um
  // campo de TEXTO chamado `file` chegaria até `arrayBuffer()`, que estoura como
  // 500 não tratado. `Blob` em vez de `File` porque é a classe base.
  const enviado = formData.get('file')
  if (!(enviado instanceof Blob)) {
    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  }

  // Lista fechada, não `startsWith('image/')`: ver o porquê (SVG com script
  // servido inline na origem do app) em `src/lib/tipos-de-imagem.ts`.
  if (!tipoDeImagemDeclarado(enviado.type)) {
    return NextResponse.json({ error: `Só imagem ${FORMATOS_ACEITOS}` }, { status: 400 })
  }

  // E os bytes têm de confirmar: o tipo declarado é texto do cliente e mente.
  const buffer = Buffer.from(await enviado.arrayBuffer())
  const tipo = tipoDeImagemDosBytes(buffer)
  if (!tipo) {
    return NextResponse.json(
      { error: `O arquivo não é uma imagem ${FORMATOS_ACEITOS}` },
      { status: 400 },
    )
  }

  // A pasta existe? Perguntar ANTES de subir: um id bem formado mas inexistente
  // só estouraria no FK do INSERT, depois do upload, deixando arquivo órfão no
  // bucket. Mesmo 404 dos outros caminhos.
  if (!(await acharPessoa(pessoaId))) {
    return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
  }

  // Extensão e Content-Type vêm do tipo validado, nunca de `file.name` — o nome
  // original fica só em `original_name`, para exibição.
  const s3Key = `sem-card/${pessoaId}/${randomUUID()}.${extensaoDoTipo(tipo)}`
  try {
    await uploadFile(s3Key, buffer, tipo)
  } catch (err) {
    // Detalhe no log, nunca na tela: a mensagem da biblioteca vem em inglês e
    // carrega bucket, chave e endpoint.
    console.error('S3 upload error:', err)
    return NextResponse.json(
      { error: 'Não foi possível guardar a foto. Tente de novo.' },
      { status: 500 },
    )
  }

  // `Blob` puro não tem `name`; o runtime entrega `File`, mas não dependemos
  // disso — nome é só exibição, e sem ele a foto ainda vale.
  const nomeOriginal = typeof (enviado as File).name === 'string' ? (enviado as File).name : 'foto'

  try {
    const row = await criarFotoAvulsa({
      pessoaId, s3Key, originalName: nomeOriginal, createdBy: session.user.name ?? null,
    })
    return NextResponse.json(row)
  } catch (err) {
    // O arquivo já subiu e a linha não existe: apagar do bucket, senão fica
    // lixo que nenhuma tela mais encontra. Falha ao apagar não muda a resposta.
    console.error('Erro ao gravar a foto da pasta:', err)
    await deleteFile(s3Key).catch(e => console.error('Erro ao apagar foto órfã do S3:', e))
    return NextResponse.json(
      { error: 'Não foi possível guardar a foto. Tente de novo.' },
      { status: 500 },
    )
  }
}
