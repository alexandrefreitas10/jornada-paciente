import {
  TEXTOS_DE_AVISO,
  avisoAgendaLiberada,
  avisoHorarioDaClinica,
  avisoLembreteVespera,
  devoAvisarAgendaLiberada,
  quandoPorExtenso,
} from '@/lib/avisos-do-portal'

describe('como o horário é escrito', () => {
  it('hora cheia sai sem os minutos', () => {
    // "15h" é como a clínica fala. "15:00" é como o banco guarda.
    expect(quandoPorExtenso('2026-11-19', '15:00')).toBe('Quinta-feira, às 15h')
  })

  it('hora quebrada mantém os minutos', () => {
    expect(quandoPorExtenso('2026-11-20', '14:30')).toBe('Sexta-feira, às 14h30')
  })

  it('o dia da semana é lido em UTC, não no fuso da máquina', () => {
    // `dia` é data de calendário. Lido como instante local, 2026-11-16 vira
    // domingo em qualquer fuso a oeste — e o paciente leria o dia errado.
    expect(quandoPorExtenso('2026-11-16', '14:00')).toMatch(/^Segunda-feira/)
  })
})

describe('os três avisos', () => {
  it('agenda liberada convida a escolher horário', () => {
    const a = avisoAgendaLiberada()
    expect(a.titulo).toMatch(/agenda está liberada/i)
    expect(a.texto).toMatch(/escolha o horário/i)
  })

  it('lembrete da véspera diz quando é', () => {
    const a = avisoLembreteVespera('2026-11-19', '15:00')
    expect(a.titulo).toMatch(/amanhã/i)
    expect(a.texto).toContain('Quinta-feira, às 15h')
  })

  it('a clínica marcou, e a clínica mudou, são textos diferentes', () => {
    const marcou = avisoHorarioDaClinica('2026-11-20', '14:00', false)
    const mudou = avisoHorarioDaClinica('2026-11-20', '14:00', true)
    expect(marcou.titulo).not.toBe(mudou.titulo)
    expect(mudou.titulo).toMatch(/mudou/i)
    // Nos dois casos a pessoa precisa saber QUANDO, sem abrir nada.
    expect(marcou.texto).toContain('Sexta-feira, às 14h')
    expect(mudou.texto).toContain('Sexta-feira, às 14h')
  })
})

describe('a regra que protege a privacidade na tela bloqueada', () => {
  // O aviso aparece na tela bloqueada, onde outra pessoa lê sem querer.
  // Esta é a diferença entre um lembrete e uma indiscrição — e é regra da
  // spec, não gosto meu: docs/superpowers/specs/2026-11-16-avisos-do-portal.md
  const PROIBIDO = [
    'tirzepatida', 'soroterapia', 'medicação', 'medicamento', 'injeção',
    'intramuscular', 'endovenos', 'dose', 'tratamento', 'nutrolog', 'estétic',
  ]

  it('nenhum texto de aviso cita medicação ou procedimento', () => {
    const todos = Object.values(TEXTOS_DE_AVISO).flatMap((a) => [a.titulo, a.texto])
    for (const texto of todos) {
      for (const palavra of PROIBIDO) {
        expect(texto.toLowerCase()).not.toContain(palavra)
      }
    }
  })

  it('nenhum aviso montado cita medicação ou procedimento', () => {
    const montados = [
      avisoAgendaLiberada(),
      avisoLembreteVespera('2026-11-19', '15:00'),
      avisoHorarioDaClinica('2026-11-20', '14:00', false),
      avisoHorarioDaClinica('2026-11-20', '14:00', true),
    ]
    for (const a of montados) {
      for (const palavra of PROIBIDO) {
        expect((a.titulo + ' ' + a.texto).toLowerCase()).not.toContain(palavra)
      }
    }
  })

  it('nenhuma função de aviso recebe o nome do paciente', () => {
    // Se um dia alguém acrescentar `nome` a uma destas, este teste cai — e é
    // para cair: o celular já é da pessoa, o nome só vazaria para quem olha.
    expect(avisoAgendaLiberada.length).toBe(0)
    expect(avisoLembreteVespera.length).toBe(2)   // dia, hora
    expect(avisoHorarioDaClinica.length).toBe(3)  // dia, hora, remarcado
  })
})

describe('quando avisar que a agenda liberou', () => {
  const PRESCRICAO = 'prescricao'

  it('avisa na PRIMEIRA folha de prescrição', () => {
    expect(devoAvisarAgendaLiberada(PRESCRICAO, false)).toBe(true)
  })

  it('não avisa na segunda folha em diante', () => {
    // Paciente de tratamento longo recebe folha nova a cada ciclo. Dizer "sua
    // agenda está liberada" para quem já usa a agenda há semanas é ruído — e
    // ruído é o que faz as pessoas desligarem os avisos de vez.
    expect(devoAvisarAgendaLiberada(PRESCRICAO, true)).toBe(false)
  })

  it('não avisa por outros tipos de arquivo', () => {
    // 'prescription' é o anexo da aba Evolução e NÃO abre a agenda. Os nomes
    // são quase iguais de propósito perigoso — ver folha-prescricao.ts.
    for (const tipo of ['prescription', 'exam', 'photo', 'evolution', 'diet']) {
      expect(devoAvisarAgendaLiberada(tipo, false)).toBe(false)
    }
  })
})
