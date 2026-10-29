import {
  chaveProcedimento, agruparPorProcedimento, ehFinalizado,
  type SessaoEstetica,
} from '@/lib/estetica-relatorio'

// Nome de procedimento é real de propósito: é o caso que a regra tem de
// acertar, e não identifica ninguém. Nome de paciente é inventado.
const sessao = (over: Partial<SessaoEstetica>): SessaoEstetica => ({
  id: 1, patientId: 1, patientName: 'Fulana de Tal',
  procedimento: 'T-SCULPTOR', totalSessoes: 6, feitas: 0,
  inicio: '2026-09-01', ultimaFeita: null,
  sessions_per_week: 1, intervalo_valor: null, intervalo_unidade: null, ...over,
})

describe('chaveProcedimento', () => {
  it('junta as variações que a clínica digita de verdade', () => {
    const k = chaveProcedimento('T-SCULPTOR')
    expect(chaveProcedimento('T-sculptor')).toBe(k)
    expect(chaveProcedimento('T- SCULPTOR')).toBe(k)
    expect(chaveProcedimento('T-SCULPTOR ')).toBe(k)
    expect(chaveProcedimento('Blindagem Capilar ')).toBe(chaveProcedimento('Blindagem capilar'))
  })

  it('NÃO junta procedimentos que são diferentes de verdade', () => {
    // Confirmado pelo dono: são técnicas diferentes.
    expect(chaveProcedimento('Criolipólise de Placas'))
      .not.toBe(chaveProcedimento('Criolipolise Dinâmica'))
    expect(chaveProcedimento('Protocolo Blindagem'))
      .not.toBe(chaveProcedimento('Blindagem Capilar'))
  })
})

describe('agruparPorProcedimento', () => {
  it('exibe a grafia mais usada, não uma inventada', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 2, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 3, procedimento: 'T-sculptor' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].nome).toBe('T-SCULPTOR')
  })

  it('no empate o nome é estável: não depende da ordem em que os registros vêm', () => {
    // O que importa no empate não é QUAL grafia ganha (as duas são válidas, e
    // quem decide é a ordenação do português), e sim que a aba não troque de
    // nome quando o banco devolve as linhas em outra ordem.
    const a = agruparPorProcedimento([
      sessao({ id: 1, procedimento: 'T-sculptor' }),
      sessao({ id: 2, procedimento: 'T-SCULPTOR' }),
    ])
    const b = agruparPorProcedimento([
      sessao({ id: 2, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 1, procedimento: 'T-sculptor' }),
    ])
    expect(a[0].nome).toBe(b[0].nome)
    expect(['T-SCULPTOR', 'T-sculptor']).toContain(a[0].nome)
  })

  it('conta PACIENTES distintos, não sessões', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 7, procedimento: 'Fortalize' }),
      sessao({ id: 2, patientId: 7, procedimento: 'Fortalize ' }),
      sessao({ id: 3, patientId: 8, procedimento: 'Fortalize' }),
    ])
    expect(grupos[0].pacientes).toBe(2)
  })

  it('devolve os procedimentos em ordem alfabética', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, procedimento: 'T-SCULPTOR' }),
      sessao({ id: 2, procedimento: 'Blindagem Capilar' }),
      sessao({ id: 3, procedimento: 'DEPILAÇÃO A LASER' }),
    ])
    expect(grupos.map(g => g.nome)).toEqual(['Blindagem Capilar', 'DEPILAÇÃO A LASER', 'T-SCULPTOR'])
  })

  it('separa em aberto de finalizados, cada bloco em ordem alfabética', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 1, patientName: 'Zulmira', feitas: 6, totalSessoes: 6 }),
      sessao({ id: 2, patientId: 2, patientName: 'Amanda', feitas: 6, totalSessoes: 6 }),
      sessao({ id: 3, patientId: 3, patientName: 'Beatriz', feitas: 3, totalSessoes: 6 }),
    ])
    expect(grupos[0].emAberto.map(s => s.patientName)).toEqual(['Beatriz'])
    expect(grupos[0].finalizados.map(s => s.patientName)).toEqual(['Amanda', 'Zulmira'])
  })

  it('procedimento sem nome legível não vira aba', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, procedimento: '   ' }),
      sessao({ id: 2, procedimento: 'Fortalize' }),
    ])
    expect(grupos.map(g => g.nome)).toEqual(['Fortalize'])
  })

  it('junta os nomes diferentes que o dono declarou como o mesmo procedimento', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 1, procedimento: 'Blindagem Capilar' }),
      sessao({ id: 2, patientId: 2, procedimento: 'Protocolo Blindagem ' }),
      sessao({ id: 3, patientId: 3, procedimento: 'Criolipolise ' }),
      sessao({ id: 4, patientId: 4, procedimento: 'Criolipólise de Placas' }),
    ])
    expect(grupos.map(g => g.nome)).toEqual(['Blindagem Capilar', 'Criolipólise de Placas'])
    expect(grupos[0].pacientes).toBe(2)
    expect(grupos[1].pacientes).toBe(2)
  })

  it('o nome declarado vence a grafia mais usada', () => {
    // Senão a escolha do dono perderia para a contagem: aqui "Criolipolise"
    // aparece mais, mas o nome que ele quer ver é o outro.
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 1, procedimento: 'Criolipolise' }),
      sessao({ id: 2, patientId: 2, procedimento: 'Criolipolise ' }),
      sessao({ id: 3, patientId: 3, procedimento: 'Criolipólise de Placas' }),
    ])
    expect(grupos[0].nome).toBe('Criolipólise de Placas')
  })

  it('Criolipolise Dinâmica continua separada: é técnica diferente', () => {
    const grupos = agruparPorProcedimento([
      sessao({ id: 1, patientId: 1, procedimento: 'Criolipolise ' }),
      sessao({ id: 2, patientId: 2, procedimento: 'Criolipolise Dinâmica ' }),
    ])
    expect(grupos).toHaveLength(2)
  })

  it('os 15 nomes que existem hoje viram 7 procedimentos', () => {
    // Medido na produção em 23/10/2026: 9 pela regra automática, menos as 2
    // junções que o dono declarou em 26/10. Se este número mudar sem alguém
    // ter mexido na regra, é sinal de que a normalização mudou sozinha.
    const reais = [
      'Blindagem Capilar', 'Blindagem Capilar ', 'Blindagem capilar ',
      'T-SCULPTOR', 'T-sculptor', 'T- SCULPTOR', 'T-SCULPTOR ',
      'Fortalize', 'Fortalize ',
      'Criolipolise ', 'Criolipólise de Placas', 'Criolipolise Dinâmica ',
      'Protocolo Blindagem ', 'Radiofrequência ', 'DEPILAÇÃO A LASER',
    ]
    const grupos = agruparPorProcedimento(
      reais.map((procedimento, i) => sessao({ id: i + 1, patientId: i + 1, procedimento })),
    )
    expect(grupos).toHaveLength(7)
  })
})

describe('ehFinalizado', () => {
  it('é finalizado quando fez tudo, ou mais', () => {
    expect(ehFinalizado({ feitas: 6, totalSessoes: 6 })).toBe(true)
    // Sessão a mais registrada por engano não pode deixar o paciente preso
    // em "em aberto".
    expect(ehFinalizado({ feitas: 7, totalSessoes: 6 })).toBe(true)
  })

  it('é aberto quando falta sessão', () => {
    expect(ehFinalizado({ feitas: 3, totalSessoes: 6 })).toBe(false)
    expect(ehFinalizado({ feitas: 0, totalSessoes: 6 })).toBe(false)
  })

  it('sem meta de sessões, fica em aberto — não se finaliza o que não tem meta', () => {
    expect(ehFinalizado({ feitas: 0, totalSessoes: 0 })).toBe(false)
    expect(ehFinalizado({ feitas: 3, totalSessoes: 0 })).toBe(false)
  })
})
