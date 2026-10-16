import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { canConciliacaoSession } from '@/lib/authz'
import { lerSistemaDoMes, montarMesGravado } from '@/lib/conciliacao-db'
import { mesValido } from '@/lib/conciliacao/periodo'
import { apagarFatura, lerMemoria, salvarFatura } from '@/lib/fatura-db'
import { chaveEstabelecimento, enquadrar } from '@/lib/fatura/enquadrar'
import { sugerirCategorias } from '@/lib/fatura/ia'
import { lerFatura } from '@/lib/fatura/ler-fatura'
import { linhasDaFatura } from '@/lib/fatura/pdf-posicional'
import { uploadFile } from '@/lib/s3'

export const dynamic = 'force-dynamic'

// A fatura do cartão de um mês: o que abre a linha opaca "Cartão de Crédito".
//
// É enviada À PARTE dos quatro arquivos da conciliação, e de propósito: o dono
// recebe a fatura em outro momento, e reenviar o mês (porque o BPO corrigiu
// alguma coisa) não pode apagar a fatura que ele já subiu e já corrigiu à mão.
//
// A ordem das conferências é a mesma do envio do mês: **nada é lido antes da
// permissão, e nada é gravado antes de a leitura fechar.** Uma fatura cujo
// resíduo não é zero perdeu compra na leitura, e gravá-la faria uma categoria
// aparecer MENOR do que é — pior que a linha opaca de R$ 25 mil, porque parece
// informação.

/** Teto do arquivo. A fatura real tem 9 páginas e poucos KB; o teto existe para
 *  um PDF gigante não derrubar o processo ao ser carregado na memória. */
const MAX_ARQUIVO = 15 * 1024 * 1024
/** Teto do corpo inteiro, conferido ANTES de ler o multipart (o `formData()`
 *  carrega tudo na memória, então recusar depois já seria tarde). */
const MAX_CORPO = MAX_ARQUIVO + 1024 * 1024

type Params = { params: Promise<{ mes: string }> }

const motivo = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Centavos → "R$ 1.234,56". Só para a mensagem de erro: a tela tem o seu
 *  próprio formatador, e aqui o número precisa estar na frase que o dono lê. */
const reais = (centavos: number) =>
  `${centavos < 0 ? '-' : ''}R$ ${(Math.abs(centavos) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')

/** Erro que vira 400 com a mensagem para a tela. Nada foi gravado quando sobe. */
class ErroDeEnvio extends Error {}

async function guarda(mesBruto: string): Promise<string | NextResponse> {
  if (!(await canConciliacaoSession())) {
    return NextResponse.json({ error: 'Sem permissão para a Conciliação' }, { status: 403 })
  }
  if (!mesValido(mesBruto)) {
    return NextResponse.json({ error: `Mês inválido: "${mesBruto}". Esperado AAAA-MM.` }, { status: 400 })
  }
  return mesBruto
}

export async function POST(req: NextRequest, { params }: Params) {
  const { mes: mesBruto } = await params
  const mes = await guarda(mesBruto)
  if (typeof mes !== 'string') return mes

  const tamanho = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(tamanho) && tamanho > MAX_CORPO) {
    return NextResponse.json(
      { error: `Envio de ${mb(tamanho)} MB, acima do limite de ${mb(MAX_CORPO)} MB.` },
      { status: 400 }
    )
  }

  const session = await auth()
  const userName = session?.user?.name ?? 'desconhecido'

  try {
    const form = await req.formData().catch(() => {
      throw new ErroDeEnvio('Não foi possível ler o envio (esperado multipart/form-data com o PDF da fatura).')
    })

    const arquivo = form.get('fatura')
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw new ErroDeEnvio('Faltou anexar o PDF da fatura do cartão.')
    }
    if (arquivo.size > MAX_ARQUIVO) {
      throw new ErroDeEnvio(
        `O PDF da fatura tem ${mb(arquivo.size)} MB, acima do limite de ${mb(MAX_ARQUIVO)} MB.`
      )
    }

    // Cópia de propósito: os mesmos bytes vão para o S3 depois, e o pdf.js toma
    // posse do buffer que recebe — sem a cópia, a de histórico subiria vazia.
    const bytes = Buffer.from(await arquivo.arrayBuffer())

    let lida
    try {
      lida = lerFatura(await linhasDaFatura(new Uint8Array(bytes)))
    } catch (err) {
      throw new ErroDeEnvio(`Não foi possível ler a fatura ("${arquivo.name}"): ${motivo(err)}`)
    }

    // A prova da leitura, e a razão de ela existir: a soma das compras tem de
    // bater com o DESPESAS/DÉBITOS que a própria fatura imprime.
    if (lida.residuo !== 0) {
      const soma = lida.despesasDeclaradas + lida.residuo
      throw new ErroDeEnvio(
        `A leitura desta fatura não fecha: as ${lida.compras.length} compras lidas somam ${reais(soma)}, ` +
          `mas a fatura declara ${reais(lida.despesasDeclaradas)} em DESPESAS/DÉBITOS — ` +
          `sobram ${reais(lida.residuo)} sem explicação. A fatura NÃO foi gravada e o Custos continua ` +
          `mostrando a linha "Cartão de Crédito": uma abertura incompleta faria uma categoria parecer ` +
          `menor do que é. Confira se o PDF é a fatura inteira, com todas as páginas.`
      )
    }
    if (lida.compras.length === 0) {
      throw new ErroDeEnvio(
        `Nenhuma compra encontrada no PDF ("${arquivo.name}"). Confira se é a fatura do cartão e não outro documento.`
      )
    }

    // As categorias oferecidas são as que o BPO JÁ USA no mês — sem o mês
    // enviado não há lista nenhuma, e a fatura cairia inteira em "não
    // identificado" sem ter de onde tirar o valor que ela substitui.
    const sistema = await lerSistemaDoMes(mes)
    if (!sistema) {
      throw new ErroDeEnvio(
        `A conciliação de ${mes} ainda não foi enviada. Envie os quatro arquivos do mês antes da fatura: ` +
          `as categorias da fatura são as que o BPO usa no mês.`
      )
    }
    const categorias = sistema.map(l => l.categoria)

    // O que o dono já corrigiu vence sempre, e por isso só se pergunta à IA o
    // que a memória não sabe: medido nas duas faturas reais, uma memória feita
    // só com setembro já cobre 41 das 67 compras de outubro.
    const memoria = await lerMemoria()
    const desconhecidos = lida.compras
      .map(c => c.estabelecimento)
      .filter(nome => {
        const chave = chaveEstabelecimento(nome)
        return !!chave && !memoria.has(chave)
      })

    // A IA é a 5ª função de IA do projeto e divide o mesmo saldo das outras
    // quatro. Ela já trata as próprias falhas devolvendo mapa vazio; o try aqui
    // cobre o que ela não vê (o cliente que não constrói sem chave de API).
    // Falha de IA custa sugestão, nunca a fatura.
    let sugestao = new Map<string, string | null>()
    if (desconhecidos.length > 0) {
      try {
        sugestao = await sugerirCategorias(desconhecidos, categorias)
      } catch (err) {
        console.error('[fatura] sugestão automática de categoria falhou:', motivo(err))
      }
    }

    const compras = enquadrar(lida.compras, memoria, sugestao, categorias)

    // S3: a cópia de histórico. Falhar aqui NÃO derruba o envio (mesmo padrão
    // da conciliação e do scan-nf): perder a cópia é ruim, perder a leitura da
    // fatura é pior. A chave que não subiu fica `null` no banco.
    const nome = (arquivo.name || 'fatura.pdf').replace(/[^\w.\-() ]+/g, '_')
    const chave = `conciliacao/${mes}/fatura/${Date.now()}-${nome}`
    let s3Key: string | null = null
    try {
      await uploadFile(chave, bytes, arquivo.type || 'application/pdf')
      s3Key = chave
    } catch (err) {
      console.error('[fatura] upload para o S3 falhou:', motivo(err))
    }

    // Subir a mesma fatura duas vezes não duplica compra: a transação apaga a
    // fatura do mês antes de inserir, e o CASCADE leva as compras da versão
    // velha.
    await salvarFatura({ mes, lida, compras, s3Key, createdBy: userName })

    const naoIdentificadas = compras.filter(c => c.origem === 'nao_identificado').length
    await logAudit({
      userName,
      action: 'fatura_cartao_enviada',
      entityType: 'fatura_cartao',
      entityId: mes,
      details:
        `ref. ${lida.referencia}; ${compras.length} compras somando ${reais(lida.despesasDeclaradas)}; ` +
        `${naoIdentificadas} não identificadas; S3: ${s3Key ?? 'não subiu'}`,
    })

    return await respostaDoMes(mes)
  } catch (err) {
    if (err instanceof ErroDeEnvio) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    // Erro inesperado: a mensagem crua pode trazer pedaço do arquivo, então ela
    // só vai para o log do servidor.
    console.error('[fatura] envio falhou:', err)
    return NextResponse.json({ error: 'Não foi possível processar a fatura. Tente de novo.' }, { status: 500 })
  }
}

/**
 * Remove a fatura do mês: a linha "Cartão de Crédito" volta ao Custos.
 *
 * Existe porque subir a fatura errada é fácil (são duas por mês chegando no
 * e-mail). A memória do que o dono corrigiu NÃO é apagada: ela é o que ele
 * ensinou ao sistema, não um pedaço desta fatura — e refazer o envio tem de
 * chegar nas mesmas categorias. A cópia no S3 também fica, como histórico do
 * que foi enviado um dia (mesmo critério dos quatro arquivos do mês).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { mes: mesBruto } = await params
  const mes = await guarda(mesBruto)
  if (typeof mes !== 'string') return mes

  const session = await auth()
  const userName = session?.user?.name ?? 'desconhecido'

  const apagada = await apagarFatura(mes)
  if (!apagada) {
    return NextResponse.json({ error: `Não há fatura de cartão enviada para ${mes}.` }, { status: 404 })
  }

  await logAudit({
    userName,
    action: 'fatura_cartao_removida',
    entityType: 'fatura_cartao',
    entityId: mes,
    details: `S3: ${apagada.s3Key ?? 'sem cópia'}`,
  })

  return respostaDoMes(mes)
}

/**
 * A resposta das duas ações: o mês inteiro remontado do banco, pelo MESMO
 * caminho da releitura — é o que garante que subir ou remover a fatura mostre
 * exatamente os números que o mês mostraria ao ser reaberto, em vez de a tela
 * recalcular dinheiro por conta própria.
 */
async function respostaDoMes(mes: string): Promise<NextResponse> {
  const resultado = await montarMesGravado(mes)
  if (resultado) return NextResponse.json(resultado)
  // Só acontece se a conciliação do mês for apagada entre a gravação e esta
  // leitura. A ação JÁ aconteceu: dizer "tente de novo" mandaria repeti-la.
  return NextResponse.json(
    { error: `A ação foi gravada, mas a conciliação de ${mes} não está mais no sistema. Recarregue a página.` },
    { status: 409 }
  )
}
