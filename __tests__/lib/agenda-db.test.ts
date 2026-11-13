import { duracaoValida, ehStatusAgendamento } from '@/lib/agenda-db'

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
