import { montarResultado, type LancamentoExtratoBanco } from '@/lib/conciliacao/resultado'
import type { LancamentoOutraConta } from '@/lib/conciliacao/tipos'

const EM_DINHEIRO: LancamentoOutraConta = {
  data: '2026-10-05',
  competencia: '2026-10-01',
  centavos: 150000,
  conta: 'Dinheiro',
  nome: 'SUBLOCAÇÃO',
  descricao: 'SALA 3',
  categoria: 'Receita c/ Aluguel',
}

function mov(banco: 'unicred' | 'itau', data: string, centavos: number, descricao: string): LancamentoExtratoBanco {
  return { banco, data, centavos, descricao }
}

const SAIU_ITAU = 'PIX ENVIADO ANDRADE TORRES SERVICOS MEDICOS'
const ENTROU_UNICRED = 'CREDITO RECEBIMENTO DE PIX ( Doc.: CRED PIX / ANDRADE TORRES SERVICOS MEDICOS LTDA )'

describe('montarResultado: transferências entre contas', () => {
  it('tira o par das diferenças dos dois bancos e o mostra à parte', () => {
    const r = montarResultado({
      mes: '2026-10',
      sistema: [],
      extrato: [
        mov('unicred', '2026-10-13', 900000, ENTROU_UNICRED),
        mov('itau', '2026-10-13', -900000, SAIU_ITAU),
      ],
      anterior: null,
    })

    expect(r.transferencias).toHaveLength(1)
    expect(r.transferencias[0]).toMatchObject({ de: 'itau', para: 'unicred', centavos: 900000 })
    for (const banco of r.bancos) expect(banco.soNoExtrato).toEqual([])
  })

  it('o que não é transferência continua aparecendo como diferença', () => {
    const r = montarResultado({
      mes: '2026-10',
      sistema: [],
      extrato: [
        mov('unicred', '2026-10-08', 375000, 'CRED PIX / NOME DE PACIENTE INVENTADO'),
        mov('itau', '2026-10-08', -375000, 'PAGAMENTO FORNECEDOR INVENTADO LTDA'),
      ],
      anterior: null,
    })

    expect(r.transferencias).toEqual([])
    expect(r.bancos.flatMap(b => b.soNoExtrato)).toHaveLength(2)
  })

  it('os totais do banco continuam contando a transferência: são a prova contra o extrato', () => {
    const r = montarResultado({
      mes: '2026-10',
      sistema: [],
      extrato: [
        mov('unicred', '2026-10-13', 900000, ENTROU_UNICRED),
        mov('itau', '2026-10-13', -900000, SAIU_ITAU),
      ],
      anterior: null,
    })

    const itau = r.bancos.find(b => b.banco === 'itau')!
    const unicred = r.bancos.find(b => b.banco === 'unicred')!
    expect(itau.totalExtratoDebito).toBe(-900000)
    expect(unicred.totalExtratoCredito).toBe(900000)
  })
})

describe('montarResultado: outras contas', () => {
  it('leva os lançamentos de outra conta para a tela', () => {
    const r = montarResultado({
      mes: '2026-10',
      sistema: [],
      extrato: [],
      anterior: null,
      outrasContas: [EM_DINHEIRO],
    })

    expect(r.outrasContas).toEqual([EM_DINHEIRO])
  })

  it('não deixa a outra conta entrar na conciliação nem no comparativo', () => {
    // O R$ 1.500 em dinheiro não tem extrato para conferir: vira diferença
    // falsa se entrar num banco, e muda o Resultado do mês se entrar no
    // comparativo — que é a soma das duas contas bancárias, por decisão do dono.
    const r = montarResultado({
      mes: '2026-10',
      sistema: [],
      extrato: [],
      anterior: null,
      outrasContas: [EM_DINHEIRO],
    })

    expect(r.bancos.flatMap(b => b.soNoSistema)).toEqual([])
    expect(r.comparativo.receitas).toEqual([])
  })

  it('mês gravado antes desta funcionalidade vem null, não lista vazia', () => {
    // `null` é "não sei se houve"; `[]` afirma que não houve. A tela precisa
    // distinguir os dois para não dizer que setembro não teve dinheiro quando
    // na verdade ninguém guardou.
    const r = montarResultado({ mes: '2026-10', sistema: [], extrato: [], anterior: null })

    expect(r.outrasContas).toBeNull()
  })

  it('mês lido pela versão nova e sem nenhuma outra conta vem lista vazia', () => {
    const r = montarResultado({ mes: '2026-10', sistema: [], extrato: [], anterior: null, outrasContas: [] })

    expect(r.outrasContas).toEqual([])
  })
})
