import {
  HORAS_DE_ANTECEDENCIA,
  SEMANAS_VISIVEIS,
  aindaNaoComecou,
  comAntecedenciaMinima,
  janelaDoPaciente,
  podeMarcarOutro,
  podeMexerNoAgendamento,
} from '@/lib/agenda-paciente'

// Nomes e ids INVENTADOS.
const AGORA = new Date('2026-11-16T18:00:00Z') // segunda, 15:00 em Brasília

describe('janelaDoPaciente', () => {
  it('abre de hoje até quatro semanas à frente', () => {
    const { de, ate } = janelaDoPaciente('2026-11-16')
    expect(de).toBe('2026-11-16')
    expect(ate).toBe('2026-12-13') // 27 dias depois: hoje + 4 semanas, incluindo hoje
  })

  it('a janela tem exatamente as semanas que a constante diz', () => {
    // Se alguém mudar SEMANAS_VISIVEIS, a janela acompanha — e este teste
    // continua valendo em vez de virar um número solto desatualizado.
    const { de, ate } = janelaDoPaciente('2026-11-16')
    const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000 + 1
    expect(dias).toBe(SEMANAS_VISIVEIS * 7)
  })
})

describe('podeMarcarOutro', () => {
  const futuro = { dia: '2026-11-18', hora: '15:00', status: 'agendado' }
  const passado = { dia: '2026-11-09', hora: '15:00', status: 'agendado' }

  it('sem nada marcado, pode', () => {
    expect(podeMarcarOutro([], AGORA)).toBe(true)
  })

  it('com um agendamento FUTURO, não pode marcar outro', () => {
    expect(podeMarcarOutro([futuro], AGORA)).toBe(false)
  })

  it('o que já passou libera a próxima — quem libera é o RELÓGIO', () => {
    // Decisão do dono. Se dependesse de alguém clicar em "atendido", um
    // agendamento esquecido travaria o paciente para sempre, e ele voltaria a
    // pedir horário no grupo — que é o fracasso declarado deste projeto.
    expect(podeMarcarOutro([passado], AGORA)).toBe(true)
  })

  it('quem faltou também pode marcar de novo', () => {
    expect(podeMarcarOutro([{ ...passado, status: 'faltou' }], AGORA)).toBe(true)
  })

  it('desmarcado e remarcado não seguram vaga nenhuma', () => {
    expect(podeMarcarOutro([{ ...futuro, status: 'desmarcou' }], AGORA)).toBe(true)
    expect(podeMarcarOutro([{ ...futuro, status: 'remarcou' }], AGORA)).toBe(true)
  })

  it('atendido no futuro ainda segura — é agendamento vivo', () => {
    expect(podeMarcarOutro([{ ...futuro, status: 'atendido' }], AGORA)).toBe(false)
  })
})

describe('podeMexerNoAgendamento', () => {
  it('pode mexer com folga', () => {
    // 18/11 às 15:00 BRT, estando em 16/11: muito longe.
    expect(podeMexerNoAgendamento('2026-11-18', '15:00', AGORA)).toBe(true)
  })

  it('trava dentro da última hora', () => {
    // AGORA é 15:00 BRT de 16/11. Um agendamento às 15:30 está a 30 min.
    expect(podeMexerNoAgendamento('2026-11-16', '15:30', AGORA)).toBe(false)
  })

  it('exatamente na antecedência mínima ainda deixa', () => {
    // 16:00 BRT está a 60 minutos de 15:00 BRT.
    expect(podeMexerNoAgendamento('2026-11-16', '16:00', AGORA)).toBe(true)
  })

  it('o que já passou também está travado', () => {
    expect(podeMexerNoAgendamento('2026-11-16', '14:00', AGORA)).toBe(false)
  })

  it('a antecedência é a que a constante diz', () => {
    expect(HORAS_DE_ANTECEDENCIA).toBe(1)
  })
})


describe('aindaNaoComecou — a regra de MARCAR', () => {
  // Decisão do dono (13/11/2026): marcar pode ser em cima da hora, desde que
  // haja vaga. Marcar não desperdiça nada; o que não pode é marcar num
  // horário que já começou.
  //
  // É diferente de DESMARCAR, que exige uma hora: ali a medicação já foi
  // separada, e soltar a vaga tarde demais perde o insumo.
  it('aceita horário daqui a poucos minutos', () => {
    // AGORA é 15:00 em Brasília. 15:10 é em dez minutos — pode.
    expect(aindaNaoComecou('2026-11-16', '15:10', AGORA)).toBe(true)
  })

  it('aceita o horário que está quase começando', () => {
    expect(aindaNaoComecou('2026-11-16', '15:01', AGORA)).toBe(true)
  })

  it('recusa o que já começou', () => {
    expect(aindaNaoComecou('2026-11-16', '15:00', AGORA)).toBe(false)
    expect(aindaNaoComecou('2026-11-16', '14:50', AGORA)).toBe(false)
    expect(aindaNaoComecou('2026-11-16', '12:00', AGORA)).toBe(false)
  })

  it('aceita qualquer coisa nos próximos dias', () => {
    expect(aindaNaoComecou('2026-11-18', '09:00', AGORA)).toBe(true)
  })
})

describe('as duas regras são DIFERENTES, de propósito', () => {
  it('um horário daqui a dez minutos: pode marcar, não pode desmarcar', () => {
    // Este é o caso que separa as duas. Se alguém "simplificar" unificando as
    // regras, um dos dois comportamentos quebra — e este teste acusa qual.
    expect(aindaNaoComecou('2026-11-16', '15:10', AGORA)).toBe(true)
    expect(podeMexerNoAgendamento('2026-11-16', '15:10', AGORA)).toBe(false)
  })
})
