// __tests__/lib/em-tratamento.test.ts
import {
  ETIQUETAS, MENSAGENS,
  dataBrasilia, diasEntre, inicioDaSemanaBrasilia,
  classificar, primeiroNome, mensagemPara, listarSubAba,
  ehSaidaDeImplante, mensagemLonga,
  INTERVALOS, INTERVALO_PADRAO, ehIntervaloValido, limiteCritico,
  type PacienteEmTratamento,
} from '@/lib/em-tratamento'

// Quinta-feira, 17/09/2026, 12:00 em Brasília.
const AGORA = new Date('2026-09-17T15:00:00Z')

describe('datas em Brasília', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    // 23:30 de 09/09 em Brasília já é 10/09 em UTC.
    expect(dataBrasilia(new Date('2026-09-10T02:30:00Z'))).toBe('2026-09-09')
    expect(dataBrasilia(new Date('2026-09-10T03:00:00Z'))).toBe('2026-09-10')
  })

  it('conta dias de calendário, não horas', () => {
    expect(diasEntre(new Date('2026-09-16T23:00:00Z'), AGORA)).toBe(1) // 16/09 20h BRT
    expect(diasEntre(new Date('2026-09-17T03:00:00Z'), AGORA)).toBe(0) // 17/09 00h BRT
  })

  it('a semana começa na segunda-feira de Brasília', () => {
    expect(inicioDaSemanaBrasilia(AGORA)).toBe('2026-09-14')
    // Domingo 20/09 às 23h em Brasília (segunda 02h em UTC) ainda é a mesma semana.
    expect(inicioDaSemanaBrasilia(new Date('2026-09-21T02:00:00Z'))).toBe('2026-09-14')
    // Segunda 21/09 à meia-noite de Brasília já é a semana seguinte.
    expect(inicioDaSemanaBrasilia(new Date('2026-09-21T03:00:00Z'))).toBe('2026-09-21')
  })
})

describe('classificar', () => {
  const saida = (iso: string) => new Date(iso)

  it('sem nenhuma saída, não está em tratamento', () => {
    expect(classificar(null, null, AGORA)).toBeNull()
  })

  it('verde até 7 dias, contando o mesmo dia da semana anterior', () => {
    expect(classificar(saida('2026-09-17T13:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 0 })
    expect(classificar(saida('2026-09-10T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 7 })
  })

  it('amarela de 8 a 28 dias', () => {
    expect(classificar(saida('2026-09-09T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'amarela', diasSemVir: 8 })
    expect(classificar(saida('2026-08-20T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'amarela', diasSemVir: 28 })
  })

  it('vermelha a partir de 29 dias', () => {
    expect(classificar(saida('2026-08-19T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'vermelha', diasSemVir: 29 })
  })

  it('usa o dia de Brasília da aplicação: 23:30 de 09/09 são 8 dias, não 7', () => {
    expect(classificar(saida('2026-09-10T02:30:00Z'), null, AGORA)?.etiqueta).toBe('amarela')
  })

  it('folha finalizada depois da última aplicação: aguardando nova prescrição', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 6 })
  })

  it('folha no mesmo dia, DEPOIS da aplicação: aguardando', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-10T18:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 7 })
  })

  it('aplicação depois da folha é um novo ciclo: volta ao tratamento', () => {
    expect(classificar(saida('2026-09-15T12:00:00Z'), saida('2026-08-01T12:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'verde', diasSemVir: 2 })
  })

  it('folha e aplicação no mesmo instante contam como folha depois: aguardando', () => {
    const t = saida('2026-09-10T12:00:00Z')
    expect(classificar(t, new Date(t), AGORA)).toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 7 })
  })

  it('o intervalo não muda quem está aguardando', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA, 21))
      .toEqual({ etiqueta: 'aguardando', diasSemVir: 7, diasAguardando: 6 })
  })

  it('folha no mesmo dia, ANTES da aplicação, continua em tratamento', () => {
    expect(classificar(saida('2026-09-10T18:00:00Z'), saida('2026-09-10T12:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'verde', diasSemVir: 7 })
  })

  it('aplicação no futuro (relógio adiantado) não gera dias negativos', () => {
    expect(classificar(saida('2026-09-18T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 0 })
  })
})

describe('primeiroNome', () => {
  it('pega o primeiro nome e acerta a caixa', () => {
    expect(primeiroNome('ANA CAROLINE CAIXETA SILVA')).toBe('Ana')
    expect(primeiroNome('  joão pedro')).toBe('João')
    expect(primeiroNome('Érica Magalhães')).toBe('Érica')
  })

  it('nome vazio vira vazio', () => {
    expect(primeiroNome('')).toBe('')
    expect(primeiroNome('   ')).toBe('')
  })

  it('capitaliza depois de hífen e apóstrofo em nomes compostos', () => {
    expect(primeiroNome('MARIA-CLARA SOUZA')).toBe('Maria-Clara')
    expect(primeiroNome("D'ÁVILA")).toBe("D'Ávila")
  })
})

describe('mensagens', () => {
  it('há um texto para cada etiqueta, todos diferentes e com {nome}', () => {
    expect(ETIQUETAS).toEqual(['verde', 'amarela', 'vermelha', 'aguardando'])
    const textos = ETIQUETAS.map(e => MENSAGENS[e])
    expect(new Set(textos).size).toBe(4)
    for (const t of textos) expect(t).toContain('{nome}')
  })

  it('preenche o primeiro nome', () => {
    expect(mensagemPara('verde', 'MARIA SOUZA')).toMatch(/^Oi, Maria! /)
    expect(mensagemPara('amarela', 'maria souza')).toContain('não veio nesta semana')
    expect(mensagemPara('vermelha', 'Maria')).toContain('Sentimos sua falta')
  })

  it('Em dia é o acompanhamento semanal, em várias linhas, com as 4 perguntas', () => {
    const texto = mensagemPara('verde', 'MARIA SOUZA')
    expect(texto.startsWith('Oi, Maria! Vamos ao seu acompanhamento semanal')).toBe(true)
    expect(texto.split('\n').length).toBeGreaterThan(10)
    for (const p of ['1️⃣', '2️⃣', '3️⃣', '4️⃣']) expect(texto).toContain(p)
    expect(texto).toContain('efeito colateral')
    expect(texto).not.toContain('cotaleral')
    expect(texto.endsWith('jornada de transformação 😍')).toBe(true)
  })

  it('não deixa sobrar {nome} no texto', () => {
    for (const e of ETIQUETAS) expect(mensagemPara(e, 'Ana')).not.toContain('{nome}')
  })

  it('nome vazio: remove a saudação com vírgula, sem sobrar {nome}', () => {
    for (const e of ETIQUETAS) {
      expect(mensagemPara(e, '')).toMatch(/^Oi! /)
      expect(mensagemPara(e, '')).not.toContain('{nome}')
    }
  })
})

describe('listarSubAba', () => {
  const p = (patientId: number, nome: string, diasSemVir: number): PacienteEmTratamento => ({
    patientId, nome, diasSemVir,
    etiqueta: diasSemVir <= 7 ? 'verde' : diasSemVir <= 28 ? 'amarela' : 'vermelha',
    ultimaAplicacao: '2026-09-01T12:00:00.000Z',
    ultimaFolha: null,
    intervalo: 7,
    diasAguardando: null,
    enviada: null,
  })
  const pa = (patientId: number, nome: string, diasAguardando: number): PacienteEmTratamento => ({
    patientId, nome, diasSemVir: diasAguardando + 3, diasAguardando,
    etiqueta: 'aguardando',
    ultimaAplicacao: '2026-08-01T12:00:00.000Z',
    ultimaFolha: '2026-08-04T12:00:00.000Z',
    intervalo: 7,
    enviada: null,
  })
  const lista = [p(1, 'Bruno', 3), p(2, 'Ana', 40), p(3, 'Carla', 10), p(4, 'Alice', 1), p(5, 'Davi', 40)]

  it('Todos: mais dias sem vir primeiro, empate por nome', () => {
    expect(listarSubAba(lista, 'todos').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla', 'Bruno', 'Alice'])
  })

  it('Não veio: só amarelas e vermelhas, por urgência', () => {
    expect(listarSubAba(lista, 'nao_veio').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla'])
  })

  it('Veio: só verdes, por nome', () => {
    expect(listarSubAba(lista, 'veio').map(x => x.nome)).toEqual(['Alice', 'Bruno'])
  })

  it('não altera a lista original', () => {
    const antes = lista.map(x => x.patientId)
    listarSubAba(lista, 'todos')
    expect(lista.map(x => x.patientId)).toEqual(antes)
  })

  const comAguardando = [...lista, pa(6, 'Zeca', 3), pa(7, 'Beto', 20), pa(8, 'Ana Paula', 20)]

  it('Todos, Não veio e Veio não mostram quem está aguardando', () => {
    expect(listarSubAba(comAguardando, 'todos').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla', 'Bruno', 'Alice'])
    expect(listarSubAba(comAguardando, 'nao_veio').map(x => x.nome)).toEqual(['Ana', 'Davi', 'Carla'])
    expect(listarSubAba(comAguardando, 'veio').map(x => x.nome)).toEqual(['Alice', 'Bruno'])
  })

  it('Aguardando: só os 🔵, quem espera há mais tempo primeiro, empate por nome', () => {
    expect(listarSubAba(comAguardando, 'aguardando').map(x => x.nome)).toEqual(['Ana Paula', 'Beto', 'Zeca'])
  })
})

describe('ehSaidaDeImplante', () => {
  // Espelha o SQL de listarEmTratamento:
  //   COALESCE(m.observation, '') <> 'Implante hormonal' AND i.name NOT ILIKE '%implante%'
  it('reconhece implante pelo nome do item, em qualquer caixa', () => {
    expect(ehSaidaDeImplante('IMPLANTE - NADH 300 MG', null)).toBe(true)
    expect(ehSaidaDeImplante('Implante Testosterona 100 mg', '')).toBe(true)
  })

  it('reconhece implante pela observação exata da tela de Implantes', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', 'Implante hormonal')).toBe(true)
  })

  it('observação diferente da exata não conta (o SQL compara exato)', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', 'implante hormonal')).toBe(false)
  })

  it('observação com espaços nas pontas não conta (o SQL compara exato)', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', ' Implante hormonal ')).toBe(false)
  })

  it('o nome bate em qualquer posição, incluindo o plural', () => {
    expect(ehSaidaDeImplante('Kit Implantes', null)).toBe(true)
  })

  it('o resto não é implante', () => {
    expect(ehSaidaDeImplante('Tirzepartida BioMeds', 'Tirzepartida 5mg')).toBe(false)
    expect(ehSaidaDeImplante('Curcumina', null)).toBe(false)
    expect(ehSaidaDeImplante(null, null)).toBe(false)
    expect(ehSaidaDeImplante(undefined, undefined)).toBe(false)
  })
})

describe('mensagemLonga', () => {
  // Retrato dos textos atuais, não uma regra: se o dono encurtar um texto, ajuste aqui.
  it('as mensagens atuais são longas', () => {
    for (const e of ETIQUETAS) expect(mensagemLonga(mensagemPara(e, 'Ana'))).toBe(true)
  })

  it('até 3 linhas e 180 caracteres é curta', () => {
    expect(mensagemLonga('Oi, Ana!')).toBe(false)
    expect(mensagemLonga('a\nb\nc')).toBe(false)
    expect(mensagemLonga('x'.repeat(180))).toBe(false)
  })

  it('mais de 3 linhas ou mais de 180 caracteres é longa', () => {
    expect(mensagemLonga('a\nb\nc\nd')).toBe(true)
    expect(mensagemLonga('x'.repeat(181))).toBe(true)
  })
})

describe('intervalo de aplicação', () => {
  it('as opções e o padrão', () => {
    expect(INTERVALOS).toEqual([7, 10, 14, 15, 21, 28])
    expect(INTERVALO_PADRAO).toBe(7)
  })

  it('só aceita as opções da lista, como número', () => {
    expect(ehIntervaloValido(7)).toBe(true)
    expect(ehIntervaloValido(15)).toBe(true)
    expect(ehIntervaloValido(12)).toBe(false)
    expect(ehIntervaloValido('7')).toBe(false)
    expect(ehIntervaloValido(null)).toBe(false)
  })

  it('limite crítico: 28 dias, ou 2 intervalos a partir de 15', () => {
    expect([7, 10, 14, 15, 21, 28].map(limiteCritico)).toEqual([28, 28, 28, 30, 42, 56])
  })
})

describe('classificar pelo intervalo', () => {
  const s = (iso: string) => new Date(iso)
  const e = (iso: string, n: number) => classificar(s(iso), null, AGORA, n)?.etiqueta

  it('intervalo 10: até 10 em dia, 11–28 faltou, 29+ crítico', () => {
    expect(e('2026-09-07T12:00:00Z', 10)).toBe('verde')     // 10 dias
    expect(e('2026-09-06T12:00:00Z', 10)).toBe('amarela')   // 11
    expect(e('2026-08-20T12:00:00Z', 10)).toBe('amarela')   // 28
    expect(e('2026-08-19T12:00:00Z', 10)).toBe('vermelha')  // 29
  })

  it('intervalo 15: até 15 em dia, 16–30 faltou, 31+ crítico', () => {
    expect(e('2026-09-02T12:00:00Z', 15)).toBe('verde')     // 15
    expect(e('2026-09-01T12:00:00Z', 15)).toBe('amarela')   // 16
    expect(e('2026-08-18T12:00:00Z', 15)).toBe('amarela')   // 30
    expect(e('2026-08-17T12:00:00Z', 15)).toBe('vermelha')  // 31
  })

  it('intervalo 21: até 21 em dia, 22–42 faltou, 43+ crítico', () => {
    expect(e('2026-08-27T12:00:00Z', 21)).toBe('verde')     // 21
    expect(e('2026-08-26T12:00:00Z', 21)).toBe('amarela')   // 22
    expect(e('2026-08-06T12:00:00Z', 21)).toBe('amarela')   // 42
    expect(e('2026-08-05T12:00:00Z', 21)).toBe('vermelha')  // 43
  })

  it('sem intervalo informado vale 7 (comportamento de antes)', () => {
    expect(classificar(s('2026-09-10T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'verde', diasSemVir: 7 })
    expect(classificar(s('2026-09-09T12:00:00Z'), null, AGORA)).toEqual({ etiqueta: 'amarela', diasSemVir: 8 })
  })

  it('intervalo inválido (0, negativo) cai no padrão de 7', () => {
    expect(e('2026-09-09T12:00:00Z', 0)).toBe('amarela')
    expect(e('2026-09-10T12:00:00Z', -5)).toBe('verde')
  })
})

describe('mensagem de quem aguarda nova prescrição', () => {
  it('convida para a reavaliação, com o primeiro nome', () => {
    const texto = mensagemPara('aguardando', 'MARIA SOUZA')
    expect(texto.startsWith('Oi, Maria! Tudo bem? 😊 Sua prescrição chegou ao fim')).toBe(true)
    expect(texto).toContain('consulta de reavaliação')
  })
})
