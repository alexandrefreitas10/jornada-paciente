// __tests__/lib/em-tratamento.test.ts
import {
  ETIQUETAS, MENSAGENS,
  dataBrasilia, diasEntre, inicioDaSemanaBrasilia,
  classificar, primeiroNome, mensagemPara, listarSubAba,
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

  it('folha finalizada depois da última aplicação encerra o tratamento', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-11T12:00:00Z'), AGORA)).toBeNull()
  })

  it('folha no mesmo dia, DEPOIS da aplicação, encerra', () => {
    expect(classificar(saida('2026-09-10T12:00:00Z'), saida('2026-09-10T18:00:00Z'), AGORA)).toBeNull()
  })

  it('aplicação depois da folha é um novo ciclo: volta ao tratamento', () => {
    expect(classificar(saida('2026-09-15T12:00:00Z'), saida('2026-08-01T12:00:00Z'), AGORA))
      .toEqual({ etiqueta: 'verde', diasSemVir: 2 })
  })

  it('folha e aplicação no mesmo instante contam como encerrado', () => {
    const t = saida('2026-09-10T12:00:00Z')
    expect(classificar(t, new Date(t), AGORA)).toBeNull()
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
})

describe('mensagens', () => {
  it('há um texto para cada etiqueta, todos diferentes e com {nome}', () => {
    expect(ETIQUETAS).toEqual(['verde', 'amarela', 'vermelha'])
    const textos = ETIQUETAS.map(e => MENSAGENS[e])
    expect(new Set(textos).size).toBe(3)
    for (const t of textos) expect(t).toContain('{nome}')
  })

  it('preenche o primeiro nome', () => {
    expect(mensagemPara('verde', 'MARIA SOUZA')).toMatch(/^Oi, Maria! /)
    expect(mensagemPara('amarela', 'maria souza')).toContain('não veio nesta semana')
    expect(mensagemPara('vermelha', 'Maria')).toContain('Sentimos sua falta')
  })

  it('não deixa sobrar {nome} no texto', () => {
    for (const e of ETIQUETAS) expect(mensagemPara(e, 'Ana')).not.toContain('{nome}')
  })
})

describe('listarSubAba', () => {
  const p = (patientId: number, nome: string, diasSemVir: number): PacienteEmTratamento => ({
    patientId, nome, diasSemVir,
    etiqueta: diasSemVir <= 7 ? 'verde' : diasSemVir <= 28 ? 'amarela' : 'vermelha',
    ultimaAplicacao: '2026-09-01T12:00:00.000Z',
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
})
