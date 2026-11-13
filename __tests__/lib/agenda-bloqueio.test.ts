import { atingidosPeloBloqueio } from '@/lib/agenda-vagas'

const SEG = '2026-11-16'

describe('atingidosPeloBloqueio', () => {
  it('pega quem começa dentro do bloqueio', () => {
    const r = atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 1, hora: '18:10', duracao: 10 }])
    expect(r).toEqual([1])
  })
  // Review Focus 4
  it('pega quem começa ANTES e termina dentro', () => {
    const r = atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 2, hora: '17:40', duracao: 40 }])   // 17:40–18:20, invade
    expect(r).toEqual([2])
  })
  it('não pega quem termina antes de começar o bloqueio', () => {
    expect(atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 3, hora: '17:10', duracao: 40 }])).toEqual([])   // 17:10–17:50
  })
  // Borda do intervalo meio-aberto: 17:20 + 40 min termina às 18:00 em ponto.
  it('não pega quem termina exatamente quando o bloqueio começa', () => {
    expect(atingidosPeloBloqueio({ dia: SEG, de: '18:00', ate: '19:00' },
      [{ id: 4, hora: '17:20', duracao: 40 }])).toEqual([])
  })
})
