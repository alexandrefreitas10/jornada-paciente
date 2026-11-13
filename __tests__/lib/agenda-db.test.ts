import { duracaoValida, ehStatusAgendamento, ehFatiaOcupada } from '@/lib/agenda-db'

describe('duracaoValida', () => {
  it('aceita só 10 e 40', () => {
    expect(duracaoValida(10)).toBe(true)
    expect(duracaoValida(40)).toBe(true)
  })
  it.each([0, 20, 50, -10, 10.5, NaN])('recusa %p', (n) => {
    expect(duracaoValida(n)).toBe(false)
  })
})

describe('ehStatusAgendamento', () => {
  it.each(['agendado', 'atendido', 'faltou', 'remarcou', 'desmarcou'])('aceita %s', (s) => {
    expect(ehStatusAgendamento(s)).toBe(true)
  })
  it.each(['cancelado', '', 'Agendado'])('recusa %p', (s) => {
    expect(ehStatusAgendamento(s)).toBe(false)
  })
})

describe('ehFatiaOcupada', () => {
  it('true para 23505 do índice da fatia', () => {
    expect(ehFatiaOcupada({ code: '23505', constraint_name: 'agendamento_fatia_viva' })).toBe(true)
  })
  it('false para 23505 de outra constraint', () => {
    expect(ehFatiaOcupada({ code: '23505', constraint_name: 'patients_pkey' })).toBe(false)
  })
  it('false para outro código, mesmo com o nome do índice', () => {
    expect(ehFatiaOcupada({ code: '23514', constraint_name: 'agendamento_fatia_viva' })).toBe(false)
  })
  it.each([new Error('x'), null, undefined, 'texto', 42])('false para %p', (e) => {
    expect(ehFatiaOcupada(e)).toBe(false)
  })
})
