import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { canConciliacaoSession } from '@/lib/authz'
import { lerSistemaDoMes, listarMeses, salvarMes, type ChavesS3 } from '@/lib/conciliacao-db'
import { lerExtratoItau } from '@/lib/conciliacao/extrato-itau'
import { lerExtratoUnicred } from '@/lib/conciliacao/extrato-unicred'
import { linhasDoPdf } from '@/lib/conciliacao/pdf'
import { conferirPeriodo, dentroDoMes, mesAnterior, mesValido } from '@/lib/conciliacao/periodo'
import { lerPlanilha } from '@/lib/conciliacao/planilha'
import {
  montarResultado,
  type LancamentoExtratoBanco,
  type Leitura,
  type LeituraExtrato,
  type LeituraPlanilha,
} from '@/lib/conciliacao/resultado'
import type { Banco, ExtratoLido, PlanilhaLida } from '@/lib/conciliacao/tipos'
import { matrizDoXlsx } from '@/lib/conciliacao/xlsx'
import { uploadFile } from '@/lib/s3'

export const dynamic = 'force-dynamic'

// Envio mensal da conciliação: quatro arquivos e o mês de referência.
//
// A ordem das conferências não é por gosto: **nada é lido antes da permissão, e
// nada é gravado antes de todas as conferências passarem.** Um envio recusado
// não deixa rastro no banco, porque meia conciliação gravada mente mais do que
// não ter conciliação nenhuma.

/** Teto por arquivo. O extrato real tem 186 KB; o teto existe para um PDF
 *  gigante não derrubar o processo ao ser carregado na memória. */
const MAX_ARQUIVO = 15 * 1024 * 1024
/** Teto do corpo inteiro, conferido ANTES de ler o multipart: o `formData()`
 *  carrega tudo na memória, então recusar depois já seria tarde. */
const MAX_CORPO = 4 * MAX_ARQUIVO + 1024 * 1024

const CAMPOS = [
  { campo: 'recebidas', rotulo: 'planilha de contas recebidas' },
  { campo: 'pagas', rotulo: 'planilha de contas pagas' },
  { campo: 'unicred', rotulo: 'extrato do Unicred' },
  { campo: 'itau', rotulo: 'extrato do Itaú' },
] as const

type Campo = (typeof CAMPOS)[number]['campo']

/** Erro que vira 400 com a mensagem para a tela. Nada foi gravado quando ele sobe. */
class ErroDeEnvio extends Error {}

const motivo = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Tamanho em MB para a mensagem, com vírgula decimal: "15,7". Sem arredondar
 *  para inteiro, senão o arquivo recusado apareceria com o mesmo número do
 *  limite ("15 MB, acima do limite de 15 MB"). */
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')

/** A planilha do BPO: xlsx → matriz → lançamentos. Estoura nomeando o arquivo. */
async function planilha(bytes: Uint8Array, nome: string, rotulo: string): Promise<PlanilhaLida> {
  try {
    // Cópia de propósito: os mesmos bytes vão para o S3 depois, e biblioteca
    // de leitura que toma posse do buffer (o pdf.js faz isso) deixaria a cópia
    // de histórico subir vazia.
    return lerPlanilha(await matrizDoXlsx(new Uint8Array(bytes)))
  } catch (err) {
    throw new ErroDeEnvio(`Não foi possível ler a ${rotulo} ("${nome}"): ${motivo(err)}`)
  }
}

/** O extrato: PDF → linhas → movimentos. Estoura nomeando o arquivo. */
async function extrato(
  bytes: Uint8Array,
  nome: string,
  rotulo: string,
  leitor: (linhas: string[]) => ExtratoLido
): Promise<ExtratoLido> {
  try {
    return leitor(await linhasDoPdf(new Uint8Array(bytes)))
  } catch (err) {
    throw new ErroDeEnvio(`Não foi possível ler o ${rotulo} ("${nome}"): ${motivo(err)}`)
  }
}

function contarPlanilha(lida: PlanilhaLida, foraDoMes: number): LeituraPlanilha {
  return {
    lancamentos: lida.lancamentos.length - foraDoMes,
    semDataPagamento: lida.semDataPagamento,
    bancoDesconhecido: lida.bancoDesconhecido,
    semValor: lida.semValor,
    foraDoMes,
  }
}

function contarExtrato(lido: ExtratoLido, foraDoMes: number): LeituraExtrato {
  return {
    periodo: lido.periodo,
    movimentos: lido.lancamentos.length - foraDoMes,
    naoEntendidas: lido.naoEntendidas,
    // A prova de saldo vai inteira, como o leitor a mediu: ela é sobre TODOS os
    // movimentos do arquivo, inclusive os de fora do mês, porque os saldos
    // impressos cobrem o período do arquivo e não o mês conciliado.
    conferenciaSaldo: lido.conferenciaSaldo,
    foraDoMes,
  }
}

export async function GET() {
  if (!(await canConciliacaoSession())) {
    return NextResponse.json({ error: 'Sem permissão para a Conciliação' }, { status: 403 })
  }
  return NextResponse.json(await listarMeses())
}

export async function POST(req: NextRequest) {
  if (!(await canConciliacaoSession())) {
    return NextResponse.json({ error: 'Sem permissão para a Conciliação' }, { status: 403 })
  }

  // Antes de tocar no corpo: um envio absurdamente grande é recusado pelo
  // cabeçalho, porque ler o multipart já significa carregá-lo na memória.
  const tamanho = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(tamanho) && tamanho > MAX_CORPO) {
    return NextResponse.json(
      { error: `Envio de ${mb(tamanho)} MB, acima do limite de ${mb(MAX_CORPO)} MB para os quatro arquivos.` },
      { status: 400 }
    )
  }

  const session = await auth()
  const userName = session?.user?.name ?? 'desconhecido'

  try {
    const form = await req.formData().catch(() => {
      throw new ErroDeEnvio('Não foi possível ler o envio (esperado multipart/form-data com os quatro arquivos e o mês).')
    })

    const mes = String(form.get('mes') ?? '').trim()
    if (!mesValido(mes)) {
      throw new ErroDeEnvio(`Mês inválido: "${mes}". Esperado AAAA-MM, por exemplo 2026-09.`)
    }

    // Os quatro são obrigatórios: conciliar com um extrato faltando daria a
    // falsa impressão de que o outro banco está certo.
    const arquivos = {} as Record<Campo, File>
    const faltando: string[] = []
    for (const { campo, rotulo } of CAMPOS) {
      const valor = form.get(campo)
      if (valor instanceof File && valor.size > 0) arquivos[campo] = valor
      else faltando.push(rotulo)
    }
    if (faltando.length) {
      throw new ErroDeEnvio(`Faltou enviar: ${faltando.join(', ')}. Os quatro arquivos são obrigatórios.`)
    }

    for (const { campo, rotulo } of CAMPOS) {
      if (arquivos[campo].size > MAX_ARQUIVO) {
        throw new ErroDeEnvio(
          `O arquivo da ${rotulo} tem ${mb(arquivos[campo].size)} MB, acima do limite de ${mb(MAX_ARQUIVO)} MB.`
        )
      }
    }

    // Os bytes são lidos UMA vez e reaproveitados na leitura e no S3.
    const conteudo = {} as Record<Campo, Buffer>
    for (const { campo } of CAMPOS) conteudo[campo] = Buffer.from(await arquivos[campo].arrayBuffer())

    // --- Leitura. Nenhuma gravação até aqui.
    const recebidas = await planilha(conteudo.recebidas, arquivos.recebidas.name, 'planilha de contas recebidas')
    const pagas = await planilha(conteudo.pagas, arquivos.pagas.name, 'planilha de contas pagas')
    const unicred = await extrato(conteudo.unicred, arquivos.unicred.name, 'extrato do Unicred', lerExtratoUnicred)
    const itau = await extrato(conteudo.itau, arquivos.itau.name, 'extrato do Itaú', lerExtratoItau)

    // --- Conferência de período. Os dois erros vão juntos: se os dois extratos
    // estão errados, o dono reexporta os dois de uma vez.
    const erros = [
      conferirPeriodo('Unicred', unicred.periodo, mes),
      conferirPeriodo('Itaú', itau.periodo, mes),
    ].filter((e): e is string => e !== null)
    if (erros.length) throw new ErroDeEnvio(erros.join(' '))

    // --- O que está fora do mês fica fora da conciliação, mas é contado. Um
    // extrato que cobre MAIS que o mês passa na conferência de período, e os
    // movimentos dos outros meses não podem virar divergência inventada.
    const dentro = (data: string) => dentroDoMes(data, mes)
    const sistema = [...recebidas.lancamentos, ...pagas.lancamentos].filter(l => dentro(l.data))
    const foraRecebidas = recebidas.lancamentos.filter(l => !dentro(l.data)).length
    const foraPagas = pagas.lancamentos.filter(l => !dentro(l.data)).length

    const movimentos: LancamentoExtratoBanco[] = []
    const foraExtrato: Record<Banco, number> = { unicred: 0, itau: 0 }
    for (const [banco, lido] of [['unicred', unicred], ['itau', itau]] as const) {
      for (const l of lido.lancamentos) {
        if (dentro(l.data)) movimentos.push({ ...l, banco })
        else foraExtrato[banco]++
      }
    }

    // Zero lançamento aproveitável nas duas planilhas é arquivo errado ou
    // formato novo. Gravar isso faria a aba dizer "nada para conciliar".
    if (sistema.length === 0) {
      throw new ErroDeEnvio(
        `Nenhum lançamento aproveitável nas duas planilhas para ${mes}: ` +
          `${recebidas.semDataPagamento + pagas.semDataPagamento} sem data de pagamento, ` +
          `${recebidas.bancoDesconhecido + pagas.bancoDesconhecido} de banco diferente de Unicred/Itaú, ` +
          `${recebidas.semValor + pagas.semValor} sem valor legível, ` +
          `${foraRecebidas + foraPagas} fora do mês. Confira se as planilhas são as do mês escolhido.`
      )
    }

    // --- S3: a cópia de histórico dos arquivos. Falhar aqui NÃO derruba o
    // envio (padrão do scan-nf): perder a cópia é ruim, perder a conciliação é
    // pior. A chave que não subiu fica `null` no banco.
    const s3: ChavesS3 = { recebidas: null, pagas: null, unicred: null, itau: null }
    for (const { campo } of CAMPOS) {
      const nome = (arquivos[campo].name || campo).replace(/[^\w.\-() ]+/g, '_')
      const chave = `conciliacao/${mes}/${Date.now()}-${campo}-${nome}`
      try {
        await uploadFile(chave, conteudo[campo], arquivos[campo].type || 'application/octet-stream')
        s3[campo] = chave
      } catch (err) {
        console.error('[conciliacao] upload para o S3 falhou:', campo, motivo(err))
      }
    }

    // --- Gravação, numa transação: reenviar o mês substitui o anterior. Os
    // descartes vão junto para o aviso de falha de leitura reaparecer quando o
    // mês for reaberto — ver `Descartes`.
    await salvarMes({
      mes,
      sistema,
      extrato: movimentos,
      s3,
      descartes: {
        naoEntendidasUnicred: unicred.naoEntendidas,
        naoEntendidasItau: itau.naoEntendidas,
        semValorRecebidas: recebidas.semValor,
        semValorPagas: pagas.semValor,
      },
      conferencias: {
        unicred: unicred.conferenciaSaldo,
        itau: itau.conferenciaSaldo,
      },
      createdBy: userName,
    })

    const subiram = Object.values(s3).filter((k): k is string => !!k)
    await logAudit({
      userName,
      action: 'conciliacao_enviada',
      entityType: 'conciliacao',
      entityId: mes,
      details:
        `${sistema.length} lançamentos do sistema, ${movimentos.length} movimentos de extrato; ` +
        `${subiram.length}/4 arquivos no S3 (${subiram.join(', ') || 'nenhum'})`,
    })

    // O mês anterior é só para o comparativo, e ele vem DEPOIS da gravação. Se
    // esta leitura falhar, o mês já está gravado: responder 500 ("tente de
    // novo") mandaria o dono reenviar algo que já entrou. Então o comparativo
    // fica de fora e o resto da resposta vai igual.
    const anteriorMes = mesAnterior(mes)
    let anteriorSistema: Awaited<ReturnType<typeof lerSistemaDoMes>> = null
    try {
      anteriorSistema = await lerSistemaDoMes(anteriorMes)
    } catch (err) {
      console.error('[conciliacao] leitura do mês anterior falhou depois de gravar:', anteriorMes, motivo(err))
    }

    return NextResponse.json(
      montarResultado({
        mes,
        sistema,
        extrato: movimentos,
        anterior: anteriorSistema ? { mes: anteriorMes, sistema: anteriorSistema } : null,
        leitura: {
          recebidas: contarPlanilha(recebidas, foraRecebidas),
          pagas: contarPlanilha(pagas, foraPagas),
          unicred: contarExtrato(unicred, foraExtrato.unicred),
          itau: contarExtrato(itau, foraExtrato.itau),
        } satisfies Leitura,
      })
    )
  } catch (err) {
    if (err instanceof ErroDeEnvio) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    // Erro inesperado: a mensagem crua pode trazer pedaço do arquivo, então ela
    // só vai para o log do servidor.
    console.error('[conciliacao] envio falhou:', err)
    return NextResponse.json({ error: 'Não foi possível processar o envio. Tente de novo.' }, { status: 500 })
  }
}
