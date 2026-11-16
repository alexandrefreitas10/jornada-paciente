import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConviteDeAviso } from '@/components/portal/ConviteDeAviso'

/**
 * O convite para ligar os avisos, mostrado logo depois de o paciente marcar
 * uma aplicação.
 *
 * A REGRA QUE NÃO PODE SER QUEBRADA: a caixa do navegador só pode abrir a
 * partir de um toque da pessoa. Um "não" ali fica gravado para sempre — nem
 * nós nem ninguém consegue perguntar de novo, só os Ajustes do aparelho
 * desfazem. Então o convite é NOSSO, e só o toque nele abre a caixa do
 * navegador; recusar o convite não gasta a única chance.
 */

const ligar = jest.fn()
let estadoAtual = 'desligado'

jest.mock('@/components/portal/usarAvisosPush', () => ({
  usarAvisosPush: () => ({ estado: estadoAtual, ocupado: false, ligar, desligar: jest.fn() }),
}))

beforeEach(() => {
  ligar.mockReset()
  estadoAtual = 'desligado'
})

describe('convite para ligar os avisos', () => {
  it('não abre a caixa do navegador sozinho', () => {
    render(<ConviteDeAviso />)
    // Só renderizar não pode pedir permissão. Se pedisse, quem fechasse a
    // caixa sem ler perderia a chance para sempre, em massa.
    expect(ligar).not.toHaveBeenCalled()
  })

  it('pede a permissão só quando a pessoa toca', async () => {
    const user = userEvent.setup()
    render(<ConviteDeAviso />)
    await user.click(screen.getByRole('button', { name: /quero ser avisad/i }))
    expect(ligar).toHaveBeenCalledTimes(1)
  })

  it('some quando a pessoa dispensa, sem gastar a chance', async () => {
    const user = userEvent.setup()
    render(<ConviteDeAviso />)
    await user.click(screen.getByRole('button', { name: /agora não/i }))
    expect(screen.queryByRole('button', { name: /quero ser avisad/i })).toBeNull()
    expect(ligar).not.toHaveBeenCalled()
  })

  it('não aparece para quem já tem o aviso ligado', () => {
    estadoAtual = 'ligado'
    const { container } = render(<ConviteDeAviso />)
    expect(container).toBeEmptyDOMElement()
  })

  it('não aparece para quem já recusou no navegador', () => {
    // Insistir aqui é inútil e irritante: a permissão está bloqueada e só os
    // Ajustes do aparelho desfazem.
    estadoAtual = 'negado'
    const { container } = render(<ConviteDeAviso />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no iPhone fora da tela de início, explica em vez de oferecer o botão', () => {
    // Ali o push nem existe. Oferecer o botão seria prometer o que não dá.
    estadoAtual = 'precisa_instalar'
    render(<ConviteDeAviso />)
    // O texto aparece mais de uma vez (no corpo e no nome do atalho do iOS),
    // e isso é proposital: é a instrução que a pessoa precisa seguir.
    expect(screen.getAllByText(/tela de início/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /quero ser avisad/i })).toBeNull()
  })

  it('navegador sem suporte não mostra nada', () => {
    estadoAtual = 'sem_suporte'
    const { container } = render(<ConviteDeAviso />)
    expect(container).toBeEmptyDOMElement()
  })
})
