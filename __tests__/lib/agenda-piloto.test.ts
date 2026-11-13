import { pacientePodeVerAgenda } from '@/lib/agenda-piloto'

// A lista entra por argumento nos testes para não depender do ambiente da
// máquina; em produção o padrão continua sendo `process.env`.
describe('pacientePodeVerAgenda', () => {
  it('libera só quem está na lista', () => {
    expect(pacientePodeVerAgenda(96, '96')).toBe(true)
    expect(pacientePodeVerAgenda(55, '96')).toBe(false)
  })

  it('aceita vários, com e sem espaço', () => {
    expect(pacientePodeVerAgenda(55, '96, 55 ,77')).toBe(true)
    expect(pacientePodeVerAgenda(99, '96, 55 ,77')).toBe(false)
  })

  it('FALHA FECHADA: sem variável, ninguém vê', () => {
    // O ponto inteiro deste módulo. Um padrão aberto faria a aba nascer para
    // todos os pacientes no instante do deploy, antes de alguém cadastrar a
    // lista — o oposto de um piloto.
    expect(pacientePodeVerAgenda(96, undefined)).toBe(false)
    expect(pacientePodeVerAgenda(96, '')).toBe(false)
    expect(pacientePodeVerAgenda(96, '   ')).toBe(false)
  })

  it('"todos" encerra o piloto', () => {
    expect(pacientePodeVerAgenda(99, 'todos')).toBe(true)
    expect(pacientePodeVerAgenda(99, 'TODOS')).toBe(true)
    expect(pacientePodeVerAgenda(99, ' todos ')).toBe(true)
  })

  it('lixo na lista não vira passe livre', () => {
    // Valor digitado errado no painel não pode liberar geral.
    expect(pacientePodeVerAgenda(99, 'abc')).toBe(false)
    expect(pacientePodeVerAgenda(99, '96,abc')).toBe(false)
    expect(pacientePodeVerAgenda(96, '96,abc')).toBe(true)
  })

  it('não confunde id por prefixo', () => {
    expect(pacientePodeVerAgenda(9, '96')).toBe(false)
  })
})
