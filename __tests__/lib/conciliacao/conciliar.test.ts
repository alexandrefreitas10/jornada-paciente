import { conciliar } from '@/lib/conciliacao/conciliar'
import type { LancamentoExtrato, LancamentoSistema } from '@/lib/conciliacao/tipos'

function sis(data: string, centavos: number, extra: Partial<LancamentoSistema> = {}): LancamentoSistema {
  return {
    data, centavos, banco: 'unicred', nome: 'FORNECEDOR EXEMPLO', descricao: null,
    categoria: 'Serviços contratados', competencia: null, ...extra,
  }
}

function ext(data: string, centavos: number, descricao = 'MOVIMENTO EXEMPLO'): LancamentoExtrato {
  return { data, centavos, descricao }
}

describe('conciliar', () => {
  it('casa tudo quando os dois lados batem', () => {
    const r = conciliar([sis('2026-09-01', 22500), sis('2026-09-02', -20700)], [ext('2026-09-02', -20700), ext('2026-09-01', 22500)], 'unicred')
    expect(r.conciliados).toBe(2)
    expect(r.soNoSistema).toEqual([])
    expect(r.soNoExtrato).toEqual([])
    expect(r.banco).toBe('unicred')
  })

  it('não casa valores de dias diferentes nem centavos diferentes', () => {
    const r = conciliar([sis('2026-09-01', 22500), sis('2026-09-03', 10000)], [ext('2026-09-02', 22500), ext('2026-09-03', 10001)], 'unicred')
    expect(r.conciliados).toBe(0)
    expect(r.soNoSistema).toHaveLength(2)
    expect(r.soNoExtrato).toHaveLength(2)
  })

  it('sobra só no sistema: o BPO registrou algo que o banco não tem', () => {
    const r = conciliar([sis('2026-09-08', 375000), sis('2026-09-08', 10000)], [ext('2026-09-08', 10000)], 'unicred')
    expect(r.conciliados).toBe(1)
    expect(r.soNoSistema.map(l => l.centavos)).toEqual([375000])
    expect(r.soNoExtrato).toEqual([])
  })

  it('sobra só no extrato: o banco tem algo que o BPO não registrou', () => {
    const r = conciliar([sis('2026-09-08', 10000)], [ext('2026-09-08', 10000), ext('2026-09-09', -4470, 'TARIFA')], 'unicred')
    expect(r.conciliados).toBe(1)
    expect(r.soNoSistema).toEqual([])
    expect(r.soNoExtrato.map(l => l.descricao)).toEqual(['TARIFA'])
  })

  it('sobra dos dois lados ao mesmo tempo', () => {
    const r = conciliar(
      [sis('2026-09-01', 100), sis('2026-09-02', 200)],
      [ext('2026-09-01', 100), ext('2026-09-03', 300)],
      'unicred',
    )
    expect(r.conciliados).toBe(1)
    expect(r.soNoSistema.map(l => l.centavos)).toEqual([200])
    expect(r.soNoExtrato.map(l => l.centavos)).toEqual([300])
  })

  // O caso que um mês de verdade tem: DOIS boletos de taxa do MESMO valor no
  // mesmo dia. Casar por existência ("tem esse valor nesse dia?")
  // daria um casado e um sobrando — divergência inventada, e o dono ligaria
  // para o BPO cobrar um pagamento que aconteceu.
  describe('dois lançamentos iguais no mesmo dia (contagem, não existência)', () => {
    it('2 do sistema × 2 do extrato: casa os dois', () => {
      const r = conciliar(
        [sis('2026-09-02', -20700), sis('2026-09-02', -20700)],
        [ext('2026-09-02', -20700, 'ARRECADACAO 1'), ext('2026-09-02', -20700, 'ARRECADACAO 2')],
        'unicred',
      )
      expect(r.conciliados).toBe(2)
      expect(r.soNoSistema).toEqual([])
      expect(r.soNoExtrato).toEqual([])
    })

    it('2 do sistema × 1 do extrato: deixa exatamente 1 sobra no sistema', () => {
      const r = conciliar(
        [sis('2026-09-02', -20700), sis('2026-09-02', -20700)],
        [ext('2026-09-02', -20700)],
        'unicred',
      )
      expect(r.conciliados).toBe(1)
      expect(r.soNoSistema).toHaveLength(1)
      expect(r.soNoExtrato).toEqual([])
    })

    it('1 do sistema × 3 do extrato: deixa exatamente 2 sobras no extrato', () => {
      const r = conciliar(
        [sis('2026-09-02', -20700)],
        [ext('2026-09-02', -20700, 'A'), ext('2026-09-02', -20700, 'B'), ext('2026-09-02', -20700, 'C')],
        'unicred',
      )
      expect(r.conciliados).toBe(1)
      expect(r.soNoExtrato.map(l => l.descricao)).toEqual(['B', 'C'])
    })
  })

  it('lançamento de outro banco não entra na conciliação deste', () => {
    // A conciliação é por conta. Um pagamento feito pelo Itaú não pode casar
    // com o extrato do Unicred nem aparecer como sobra dele.
    const r = conciliar(
      [sis('2026-09-01', 22500), sis('2026-09-01', 22500, { banco: 'itau' })],
      [ext('2026-09-01', 22500)],
      'unicred',
    )
    expect(r.conciliados).toBe(1)
    expect(r.soNoSistema).toEqual([])
    expect(r.soNoExtrato).toEqual([])
    expect(r.totalSistemaCredito).toBe(22500)
  })

  it('listas vazias devolvem zeros', () => {
    expect(conciliar([], [], 'itau')).toEqual({
      banco: 'itau', conciliados: 0, soNoSistema: [], soNoExtrato: [],
      totalSistemaCredito: 0, totalSistemaDebito: 0, totalExtratoCredito: 0, totalExtratoDebito: 0,
    })
  })

  it('soma crédito e débito dos dois lados, débito com sinal negativo', () => {
    const r = conciliar(
      [sis('2026-09-01', 100000), sis('2026-09-02', -40000), sis('2026-09-02', -1000)],
      [ext('2026-09-01', 100000), ext('2026-09-02', -40000)],
      'unicred',
    )
    expect(r.totalSistemaCredito).toBe(100000)
    expect(r.totalSistemaDebito).toBe(-41000)
    expect(r.totalExtratoCredito).toBe(100000)
    expect(r.totalExtratoDebito).toBe(-40000)
    // O par soma ao resultado líquido do mês sem ninguém ter de adivinhar sinal.
    expect(r.totalSistemaCredito + r.totalSistemaDebito).toBe(59000)
  })

  it('preserva a ordem de entrada nas sobras', () => {
    const r = conciliar(
      [sis('2026-09-05', 500), sis('2026-09-03', 300), sis('2026-09-04', 400)],
      [],
      'unicred',
    )
    expect(r.soNoSistema.map(l => l.data)).toEqual(['2026-09-05', '2026-09-03', '2026-09-04'])
  })

  it('não muta as listas recebidas', () => {
    const sistema = [sis('2026-09-01', 100)]
    const extrato = [ext('2026-09-01', 100)]
    conciliar(sistema, extrato, 'unicred')
    expect(sistema).toHaveLength(1)
    expect(extrato).toHaveLength(1)
  })
})
