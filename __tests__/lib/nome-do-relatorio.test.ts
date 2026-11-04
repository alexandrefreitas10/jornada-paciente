import { nomeDoRelatorio } from '@/app/relatorios/nome-do-relatorio'

// Por que existe: dois relatórios salvos no mesmo dia nasciam os dois com o
// nome da página ("Instituto Torres.pdf"), e quem baixou os dois não sabia
// qual era qual. O nome precisa dizer a visão, o recorte e a hora.

const QUANDO = new Date('2026-11-04T17:30:00.000Z') // 14h30 em Brasília

describe('nomeDoRelatorio', () => {
  it('diz a visão, o filtro e a hora quando é a lista de atrasados', () => {
    expect(nomeDoRelatorio({ visao: 'atraso', grupo: null, filtro: 'atrasados', quando: QUANDO }))
      .toBe('Estetica - Quem esta atrasado - Atrasados - 04-11-2026 14h30')
  })

  it('diz o procedimento aberto quando é a visão por procedimento', () => {
    expect(nomeDoRelatorio({ visao: 'procedimento', grupo: 'Blindagem Capilar', filtro: 'atrasados', quando: QUANDO }))
      .toBe('Estetica - Blindagem Capilar - 04-11-2026 14h30')
  })

  it('tira acento e barra, que o sistema de arquivos não aceita', () => {
    // "DEPILAÇÃO A LASER 1/2" viraria uma PASTA chamada "1" com um arquivo "2".
    expect(nomeDoRelatorio({ visao: 'procedimento', grupo: 'DEPILAÇÃO A LASER 1/2', filtro: 'todos', quando: QUANDO }))
      .toBe('Estetica - DEPILACAO A LASER 1-2 - 04-11-2026 14h30')
  })

  it('não deixa sobrar traço solto quando não há procedimento escolhido', () => {
    expect(nomeDoRelatorio({ visao: 'procedimento', grupo: null, filtro: 'todos', quando: QUANDO }))
      .toBe('Estetica - 04-11-2026 14h30')
  })
})
