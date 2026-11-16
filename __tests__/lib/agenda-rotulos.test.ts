import { STATUS_AGENDAMENTO } from '@/lib/agenda-db'
import { COR_STATUS, ROTULO_STATUS } from '@/lib/agenda-rotulos'

describe('rótulos e cores de status da agenda', () => {
  it('todo status tem rótulo e cor', () => {
    // Um status novo sem rótulo apareceria cru na tela ("desmarcou", minúsculo);
    // sem cor, sairia sem fundo e pareceria defeito. Este teste quebra na hora
    // em que alguém acrescentar o sexto status e esquecer de um dos dois mapas.
    for (const s of STATUS_AGENDAMENTO) {
      expect(ROTULO_STATUS[s]).toBeTruthy()
      expect(COR_STATUS[s]).toBeTruthy()
    }
  })

  it('o rótulo é a palavra da clínica, não a do banco', () => {
    expect(ROTULO_STATUS.agendado).toBe('Agendado')
    expect(ROTULO_STATUS.atendido).toBe('Atendido')
    expect(ROTULO_STATUS.faltou).toBe('Faltou')
    expect(ROTULO_STATUS.remarcou).toBe('Remarcou')
    expect(ROTULO_STATUS.desmarcou).toBe('Desmarcou')
  })
})
