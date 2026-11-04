import { acharTransferencias } from '@/lib/conciliacao/transferencias'
import type { ResultadoConciliacao } from '@/lib/conciliacao/conciliar'
import type { Banco, LancamentoExtrato } from '@/lib/conciliacao/tipos'

function ext(data: string, centavos: number, descricao = 'MOVIMENTO EXEMPLO'): LancamentoExtrato {
  return { data, centavos, descricao }
}

/** Um bloco de banco já conciliado, com as sobras que importam para o teste. */
function bloco(banco: Banco, soNoExtrato: LancamentoExtrato[]): ResultadoConciliacao {
  return {
    banco,
    conciliados: 0,
    soNoSistema: [],
    soNoExtrato,
    totalSistemaCredito: 0,
    totalSistemaDebito: 0,
    totalExtratoCredito: 0,
    totalExtratoDebito: 0,
  }
}

const SAIU_ITAU = 'PIX ENVIADO ANDRADE TORRES SERVICOS MEDICOS'
const ENTROU_UNICRED = 'CREDITO RECEBIMENTO DE PIX ( Doc.: CRED PIX / ANDRADE TORRES SERVICOS MEDICOS LTDA )'

describe('acharTransferencias', () => {
  it('casa a saída de um banco com a entrada do outro no mesmo dia e valor', () => {
    const { pares } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, ENTROU_UNICRED)]),
      bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU)]),
    ])

    expect(pares).toHaveLength(1)
    expect(pares[0].data).toBe('2026-10-13')
    expect(pares[0].centavos).toBe(900000)
    expect(pares[0].de).toBe('itau')
    expect(pares[0].para).toBe('unicred')
    expect(pares[0].descricaoDe).toBe(SAIU_ITAU)
    expect(pares[0].descricaoPara).toBe(ENTROU_UNICRED)
  })

  it('tira o par das sobras dos dois bancos', () => {
    const { resultados } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, ENTROU_UNICRED), ext('2026-10-20', 5000, 'TARIFA')]),
      bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU)]),
    ])

    expect(resultados[0].soNoExtrato.map(l => l.descricao)).toEqual(['TARIFA'])
    expect(resultados[1].soNoExtrato).toEqual([])
  })

  it('não inventa transferência quando nenhum lado cita o nome da empresa', () => {
    // O caso caro: pagamento a fornecedor e recebimento de paciente, mesmo dia
    // e mesmo valor, em contas diferentes. Juntar os dois esconderia duas
    // divergências de verdade.
    const { pares, resultados } = acharTransferencias([
      bloco('unicred', [ext('2026-10-08', 375000, 'CRED PIX / NOME DE PACIENTE INVENTADO')]),
      bloco('itau', [ext('2026-10-08', -375000, 'PAGAMENTO FORNECEDOR INVENTADO LTDA')]),
    ])

    expect(pares).toEqual([])
    expect(resultados[0].soNoExtrato).toHaveLength(1)
    expect(resultados[1].soNoExtrato).toHaveLength(1)
  })

  it('basta o nome da empresa em um dos lados', () => {
    const { pares } = acharTransferencias([
      bloco('unicred', [ext('2026-10-15', 1000000, ENTROU_UNICRED)]),
      bloco('itau', [ext('2026-10-15', -1000000, 'PIX ENVIADO')]),
    ])

    expect(pares).toHaveLength(1)
  })

  it('não casa dias diferentes', () => {
    const { pares } = acharTransferencias([
      bloco('unicred', [ext('2026-10-14', 900000, ENTROU_UNICRED)]),
      bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU)]),
    ])

    expect(pares).toEqual([])
  })

  it('não casa valores diferentes', () => {
    const { pares } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900001, ENTROU_UNICRED)]),
      bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU)]),
    ])

    expect(pares).toEqual([])
  })

  it('não casa dois movimentos do MESMO banco', () => {
    // Saída e entrada do mesmo valor no mesmo dia, na mesma conta, não é
    // dinheiro trocando de bolso — é um estorno, e tem de continuar à vista.
    const { pares, resultados } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, ENTROU_UNICRED), ext('2026-10-13', -900000, SAIU_ITAU)]),
      bloco('itau', []),
    ])

    expect(pares).toEqual([])
    expect(resultados[0].soNoExtrato).toHaveLength(2)
  })

  it('duas transferências iguais no mesmo dia consomem uma à outra, sem casar duas vezes', () => {
    const { pares, resultados } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, ENTROU_UNICRED), ext('2026-10-13', 900000, ENTROU_UNICRED)]),
      bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU), ext('2026-10-13', -900000, SAIU_ITAU)]),
    ])

    expect(pares).toHaveLength(2)
    expect(resultados[0].soNoExtrato).toEqual([])
    expect(resultados[1].soNoExtrato).toEqual([])
  })

  it('sobrando um lado só, a transferência continua aparecendo como diferença', () => {
    const { pares, resultados } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, ENTROU_UNICRED), ext('2026-10-13', 900000, ENTROU_UNICRED)]),
      bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU)]),
    ])

    expect(pares).toHaveLength(1)
    expect(resultados[0].soNoExtrato).toHaveLength(1)
    expect(resultados[1].soNoExtrato).toEqual([])
  })

  it('reconhece o nome da empresa com acento, minúscula e pontuação no meio', () => {
    const { pares } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, 'cred pix / andrade-torres serviços médicos')]),
      bloco('itau', [ext('2026-10-13', -900000, 'PIX ENVIADO')]),
    ])

    expect(pares).toHaveLength(1)
  })

  it('não confunde nome parecido de terceiro com o da empresa', () => {
    const { pares } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, 'CRED PIX / TORRES ANDRADE COMERCIO LTDA')]),
      bloco('itau', [ext('2026-10-13', -900000, 'PIX ENVIADO')]),
    ])

    expect(pares).toEqual([])
  })

  it('mês sem transferência nenhuma devolve os blocos como estavam', () => {
    const entrada = [
      bloco('unicred', [ext('2026-10-20', 5000, 'TARIFA')]),
      bloco('itau', [ext('2026-10-21', -8800, 'IOF')]),
    ]
    const { pares, resultados } = acharTransferencias(entrada)

    expect(pares).toEqual([])
    expect(resultados[0].soNoExtrato.map(l => l.descricao)).toEqual(['TARIFA'])
    expect(resultados[1].soNoExtrato.map(l => l.descricao)).toEqual(['IOF'])
  })

  it('os totais do banco não mudam: eles são a prova contra o extrato', () => {
    const comTotais: ResultadoConciliacao = {
      ...bloco('itau', [ext('2026-10-13', -900000, SAIU_ITAU)]),
      conciliados: 19,
      totalExtratoDebito: -2461968,
      totalSistemaDebito: -561968,
    }
    const { resultados } = acharTransferencias([
      bloco('unicred', [ext('2026-10-13', 900000, ENTROU_UNICRED)]),
      comTotais,
    ])

    expect(resultados[1].totalExtratoDebito).toBe(-2461968)
    expect(resultados[1].totalSistemaDebito).toBe(-561968)
    expect(resultados[1].conciliados).toBe(19)
  })
})
