import { NextRequest, NextResponse } from 'next/server'
import { canConciliacaoSession } from '@/lib/authz'
import { lerMes, lerSistemaDoMes } from '@/lib/conciliacao-db'
import { mesAnterior, mesValido } from '@/lib/conciliacao/periodo'
import { montarResultado } from '@/lib/conciliacao/resultado'

export const dynamic = 'force-dynamic'

// A releitura de um mês já enviado: a MESMA conciliação e o MESMO comparativo
// que o envio devolveu, montados pela mesma função pura a partir das linhas
// gravadas.
//
// A `leitura` vem reduzida: só os quatro descartes que o banco guarda, que são
// os que acendem o aviso de falha de leitura. Isso é de propósito — reabrir
// setembro no mês seguinte e ver as mesmas diferenças SEM o aviso faria o dono
// cobrar do BPO um tropeço do leitor. O resto (quantas linhas entraram, período
// do extrato) fica de fora como `undefined`, nunca como zero.

type Params = { params: Promise<{ mes: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await canConciliacaoSession())) {
    return NextResponse.json({ error: 'Sem permissão para a Conciliação' }, { status: 403 })
  }

  const { mes } = await params
  if (!mesValido(mes)) {
    return NextResponse.json({ error: `Mês inválido: "${mes}". Esperado AAAA-MM.` }, { status: 400 })
  }

  const gravado = await lerMes(mes)
  if (!gravado) {
    return NextResponse.json({ error: `A conciliação de ${mes} ainda não foi enviada.` }, { status: 404 })
  }

  const anteriorMes = mesAnterior(mes)
  const anteriorSistema = await lerSistemaDoMes(anteriorMes)

  const d = gravado.descartes
  return NextResponse.json({
    ...montarResultado({
      mes,
      sistema: gravado.sistema,
      extrato: gravado.extrato,
      anterior: anteriorSistema ? { mes: anteriorMes, sistema: anteriorSistema } : null,
      leitura: d
        ? {
            recebidas: { semValor: d.semValorRecebidas },
            pagas: { semValor: d.semValorPagas },
            // A prova de saldo volta do banco como foi gravada: `null` aqui é
            // "não há prova guardada" (extrato sem os dois saldos impressos, ou
            // mês gravado antes destas colunas), e NUNCA "fecha" — a tela diz
            // isso com estas palavras.
            unicred: { naoEntendidas: d.naoEntendidasUnicred, conferenciaSaldo: gravado.conferencias.unicred },
            itau: { naoEntendidas: d.naoEntendidasItau, conferenciaSaldo: gravado.conferencias.itau },
          }
        : null,
    }),
    enviadoEm: gravado.criadoEm,
    enviadoPor: gravado.criadoPor,
  })
}
