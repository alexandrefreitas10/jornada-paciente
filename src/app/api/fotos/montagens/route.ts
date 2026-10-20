import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'
import { acharPessoa, criarMontagem, listarMontagens } from '@/lib/fotos-db'
import { ErroDeRegra, origemDaMontagem } from '@/lib/fotos-regras'
import { ehIdentidade } from '@/lib/montagem'
import { getPatient } from '@/lib/patients'
import { deleteFile, uploadFile } from '@/lib/s3'
import { logSystemError } from '@/lib/system-errors'
import { tipoDeImagemDosBytes } from '@/lib/tipos-de-imagem'

// A checagem de sessão é repetida em toda rota desta aba por defesa em
// profundidade: o `proxy.ts` global já manda sessão de portal para o login do
// portal fora de `/api/patients/<id>`, mas a rota não confia nisso.

// A montagem chega em JPEG de resolução cheia (alguns MB), não no PNG que o
// dono baixa. O PNG da mesma imagem passa de 60 MB com foto de celular inteira,
// e o limite de corpo deste projeto é 30 MB: acima dele o Next corta o corpo em
// SILÊNCIO, o multipart chega truncado e a gravação falha depois de o download
// já ter acontecido. Foi o que fez 7 de 14 montagens sumirem no primeiro dia de
// uso. Ver `QUALIDADE_GUARDADA` em `src/lib/montagem-canvas.ts`.
export const maxDuration = 120

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await listarMontagens())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Toda recusa é REGISTRADA, não só devolvida. Uma montagem que não grava some
  // calada: o dono já baixou a imagem e segue para o próximo paciente, então a
  // tarja de aviso na tela passa despercebida e, quando ele nota a falta na
  // galeria, não sobrou rastro nenhum de qual foi nem por quê. Foi exatamente
  // o que aconteceu no primeiro dia de uso, com 6 montagens perdidas e nenhuma
  // pista. O `context` leva só ids e tamanhos — nunca nome de paciente.
  const recusa = async (motivo: string, status: number, contexto: Record<string, unknown> = {}) => {
    await logSystemError('fotos.montagem.recusada', motivo, {
      status,
      usuario: session.user?.name ?? null,
      ...contexto,
    })
    return NextResponse.json({ error: motivo }, { status })
  }

  // Corpo malformado ou truncado (conexão caindo no meio do upload de dezenas
  // de MB) faz o `formData()` lançar; sem isto é 500 vazio na cara de quem só
  // perdeu sinal.
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error('Erro ao ler o formulário da montagem:', err)
    return recusa('Não foi possível ler a imagem enviada', 400, { etapa: 'formData' })
  }

  const imagem = formData.get('imagem')
  const thumb = formData.get('thumb')
  const identidade = formData.get('identidade')
  const dataAntes = formData.get('dataAntes')
  const dataDepois = formData.get('dataDepois')

  // `instanceof Blob` e não um cast `as File`: o cast engana o TypeScript e um
  // campo de texto chamado `imagem` chegaria até `arrayBuffer()`, que estoura como
  // 500 não tratado. `Blob` em vez de `File` porque é a classe base — serve
  // tanto para o `File` que o runtime entrega hoje quanto para um `Blob` puro.
  if (!(imagem instanceof Blob) || !(thumb instanceof Blob)) {
    return recusa('Imagem não enviada', 400, {
      etapa: 'campos',
      imagemEhBlob: imagem instanceof Blob,
      thumbEhBlob: thumb instanceof Blob,
    })
  }
  if (!ehIdentidade(identidade)) return recusa('Identidade inválida', 400, { etapa: 'identidade' })

  // As datas são as de criação das duas fotos de origem, e vêm do `FormData`
  // como texto. Uma data impossível só estouraria lá embaixo, no serializador
  // do postgres.js (`new Date(x).toISOString()` lança `RangeError`) — depois de
  // a imagem já ter subido, deixando dois arquivos órfãos no bucket. Por isso é
  // conferida aqui, junto das outras validações, antes de qualquer upload.
  const dataOuErro = (valor: FormDataEntryValue | null): string | null | false => {
    if (typeof valor !== 'string' || !valor) return null
    return Number.isNaN(new Date(valor).getTime()) ? false : valor
  }
  const antesIso = dataOuErro(dataAntes)
  const depoisIso = dataOuErro(dataDepois)
  if (antesIso === false || depoisIso === false) {
    return recusa('Data da foto inválida', 400, { etapa: 'datas' })
  }

  // Toda validação acontece ANTES do upload — formato do id aqui, existência
  // logo abaixo: um id que passasse daqui subiria a imagem para o S3 e só então
  // falharia no INSERT, deixando arquivo órfão no bucket que ninguém mais
  // referencia.
  let origem
  try {
    origem = origemDaMontagem({
      patientId: formData.get('patientId'),
      pessoaId: formData.get('pessoaId'),
    })
  } catch (err) {
    // O try/catch envolve só `origemDaMontagem` de propósito: mais largo, ele
    // transformaria erro de outra natureza em 400 com mensagem enganosa. Por
    // isso também só a mensagem do nosso `ErroDeRegra` vai para a tela.
    if (err instanceof ErroDeRegra) {
      return recusa(err.message, 400, { etapa: 'origem' })
    }
    console.error('Erro ao ler a origem da montagem:', err)
    return recusa('Origem inválida', 400, {
      etapa: 'origem',
      erro: err instanceof Error ? err.message : String(err),
    })
  }

  const bytesImagem = Buffer.from(await imagem.arrayBuffer())
  const bytesThumb = Buffer.from(await thumb.arrayBuffer())

  // Confere a assinatura dos bytes antes de subir. O tipo é gravado fixo logo
  // abaixo (`image/jpeg` nos dois), mas os BYTES vêm do cliente: um login
  // da equipe poderia postar um SVG no campo `imagem`, e SVG carrega script. Como
  // a miniatura é servida inline na origem do app, um navegador que adivinhasse
  // o tipo pelo conteúdo rodaria esse script com a sessão de quem está vendo a
  // galeria. A rota de imagem fecha o outro lado com `nosniff`; aqui a garantia
  // é que o guardado é de fato o que o tipo declarado diz.
  //
  // A montagem é sempre gerada pelo nosso próprio canvas, então byte que não
  // casa a assinatura é sinal de problema, nunca de uso legítimo.
  //
  // Vem antes de qualquer upload pelo mesmo motivo que `origemDaMontagem`:
  // arquivo que sobe e depois é recusado fica órfão no bucket.
  //
  // `tipoDeImagemDosBytes` (de `tipos-de-imagem.ts`) já sabe reconhecer as
  // assinaturas e é a mesma função que guarda o upload da foto solta — manter
  // uma segunda cópia das constantes aqui era lógica duplicada que divergiria.
  if (tipoDeImagemDosBytes(bytesImagem) !== 'image/jpeg') {
    return recusa('A montagem enviada não é um JPEG', 400, { etapa: 'bytes', bytes: bytesImagem.length })
  }
  if (tipoDeImagemDosBytes(bytesThumb) !== 'image/jpeg') {
    return recusa('A miniatura enviada não é um JPEG', 400, { etapa: 'bytes-thumb', bytes: bytesThumb.length })
  }

  // Existência, e não só formato: `origemDaMontagem` valida a FORMA do id, mas
  // quem descobria que o paciente não existe era o `criarMontagem`, depois dos
  // dois uploads — e o que fica no bucket ninguém mais encontra. Pergunta ao
  // banco agora, com tudo o que é checagem local já feito, e o que sobra para o
  // INSERT é só corrida (card excluído entre esta linha e a gravação).
  const existe = origem.patientId != null
    ? await getPatient(origem.patientId)
    : await acharPessoa(origem.pessoaId)
  if (!existe) {
    return NextResponse.json(
      { error: origem.patientId != null ? 'Paciente não encontrado' : 'Pasta não encontrada' },
      { status: 400 },
    )
  }

  const base = `antes-depois/${randomUUID()}`
  const s3Key = `${base}.jpg`
  const s3KeyThumb = `${base}-thumb.jpg`
  try {
    await uploadFile(s3Key, bytesImagem, 'image/jpeg')
    await uploadFile(s3KeyThumb, bytesThumb, 'image/jpeg')
  } catch (err) {
    // Detalhe no log, nunca na tela: a mensagem da biblioteca vem em inglês e
    // carrega bucket, chave e endpoint. Se a imagem subiu e a miniatura não,
    // apagar o que entrou para não deixar órfão.
    console.error('S3 upload error:', err)
    await logSystemError('fotos.montagem.recusada', 'Falha ao subir a imagem para o S3', {
      status: 500,
      etapa: 's3',
      usuario: session.user?.name ?? null,
      bytes: bytesImagem.length,
      erro: err instanceof Error ? err.message : String(err),
    })
    await Promise.all([
      deleteFile(s3Key).catch(e => console.error('Erro ao apagar montagem órfã do S3:', e)),
      deleteFile(s3KeyThumb).catch(() => {}),
    ])
    return NextResponse.json(
      { error: 'Não foi possível guardar a montagem. Tente de novo.' },
      { status: 500 },
    )
  }

  try {
    const row = await criarMontagem({
      ...origem,
      identidade,
      s3Key,
      s3KeyThumb,
      dataAntes: antesIso,
      dataDepois: depoisIso,
      createdBy: session.user.name ?? null,
    })
    return NextResponse.json(row)
  } catch (err) {
    // Os dois arquivos já subiram e a linha não existe: apagar do bucket, senão
    // fica lixo que nenhuma tela mais encontra.
    console.error('Erro ao gravar a montagem:', err)
    await Promise.all([
      deleteFile(s3Key).catch(e => console.error('Erro ao apagar montagem órfã do S3:', e)),
      deleteFile(s3KeyThumb).catch(() => {}),
    ])

    // Só mensagem escrita pelo NOSSO código vai para a tela (ver `ErroDeRegra`
    // em `fotos-regras.ts`): `err.message` de erro de banco viraria 400 com nome
    // de tabela, de constraint e host/porta num `ECONNREFUSED`, e chamaria
    // incidente de infraestrutura de "culpa do cliente".
    if (err instanceof ErroDeRegra) {
      return recusa(err.message, 400, { etapa: 'gravacao', patientId: origem.patientId, pessoaId: origem.pessoaId })
    }
    await logSystemError('fotos.montagem.recusada', 'Falha ao gravar a montagem', {
      status: 500,
      etapa: 'gravacao',
      usuario: session.user?.name ?? null,
      patientId: origem.patientId,
      pessoaId: origem.pessoaId,
      erro: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Não foi possível guardar a montagem. Tente de novo.' },
      { status: 500 },
    )
  }
}
