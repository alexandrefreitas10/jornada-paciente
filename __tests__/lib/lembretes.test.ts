import { quemRecebeLembrete } from '@/lib/lembretes'

// Nomes e dados INVENTADOS.
function ag(p: { id: number; patient_id: number; hora: string; status?: string }) {
  return { dia: '2026-11-20', status: 'agendado', ...p }
}

describe('quem recebe o lembrete da véspera', () => {
  it('quem tem aplicação viva marcada', () => {
    const lista = [ag({ id: 1, patient_id: 10, hora: '14:00' })]
    expect(quemRecebeLembrete(lista, new Set())).toHaveLength(1)
  })

  it('não avisa quem desmarcou, faltou ou remarcou', () => {
    // Essas linhas existem só para o relatório. Lembrar alguém de uma
    // aplicação que ela desmarcou é o tipo de erro que faz a pessoa desligar
    // os avisos — e desligar é quase definitivo.
    const lista = [
      ag({ id: 1, patient_id: 10, hora: '14:00', status: 'desmarcou' }),
      ag({ id: 2, patient_id: 11, hora: '14:10', status: 'faltou' }),
      ag({ id: 3, patient_id: 12, hora: '14:20', status: 'remarcou' }),
    ]
    expect(quemRecebeLembrete(lista, new Set())).toHaveLength(0)
  })

  it('avisa quem já está marcado como atendido? não', () => {
    // `atendido` é vivo para efeito de ocupar horário, mas quem já foi
    // atendido não precisa de lembrete de amanhã. Se a linha está atendida na
    // véspera, é remarcação de um atendimento passado — não um compromisso.
    const lista = [ag({ id: 1, patient_id: 10, hora: '14:00', status: 'atendido' })]
    expect(quemRecebeLembrete(lista, new Set())).toHaveLength(0)
  })

  it('não repete para quem já recebeu', () => {
    // O lembrete pode ser disparado duas vezes (nova tentativa do agendador,
    // ou alguém abrindo a rota na mão). Receber o mesmo aviso duas vezes é
    // exatamente o ruído que a spec proíbe.
    const lista = [ag({ id: 7, patient_id: 10, hora: '14:00' })]
    expect(quemRecebeLembrete(lista, new Set([7]))).toHaveLength(0)
  })

  it('um aviso por pessoa, mesmo com dois agendamentos no dia', () => {
    // Não deveria acontecer (a regra é um por vez), mas a equipe pode encaixar.
    // Dois avisos seguidos sobre o mesmo dia parecem defeito.
    const lista = [
      ag({ id: 1, patient_id: 10, hora: '16:00' }),
      ag({ id: 2, patient_id: 10, hora: '14:00' }),
    ]
    const escolhidos = quemRecebeLembrete(lista, new Set())
    expect(escolhidos).toHaveLength(1)
    // E é o mais cedo: é o horário em que ela precisa chegar.
    expect(escolhidos[0].hora).toBe('14:00')
  })

  it('pessoas diferentes recebem cada uma a sua', () => {
    const lista = [
      ag({ id: 1, patient_id: 10, hora: '14:00' }),
      ag({ id: 2, patient_id: 11, hora: '15:00' }),
    ]
    expect(quemRecebeLembrete(lista, new Set())).toHaveLength(2)
  })
})
