import { render, screen, waitFor } from '@testing-library/react'
import { AvisosPush } from '@/components/portal/AvisosPush'

/** Finge o aparelho: user agent, modo de exibição e APIs de push. */
function fingirAparelho({ userAgent, standalone = false, comPush = true }: {
  userAgent: string
  standalone?: boolean
  comPush?: boolean
}) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
  Object.defineProperty(window.navigator, 'standalone', { value: standalone, configurable: true })
  window.matchMedia = ((q: string) => ({
    matches: standalone && q.includes('standalone'),
    media: q, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia

  if (comPush) {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }) },
      configurable: true,
    })
    ;(window as unknown as { PushManager: unknown }).PushManager = function () {}
    ;(window as unknown as { Notification: unknown }).Notification = { permission: 'default' }
  }
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120'

describe('AvisosPush', () => {
  it('no iPhone fora da tela de início, explica em vez de oferecer um botão morto', async () => {
    // Este é o caso que mais vai acontecer: o paciente abre o link no Safari.
    // Lá o push NÃO existe — oferecer "Ativar" faria ele tocar num botão que
    // não faz nada e concluir que o portal está quebrado.
    fingirAparelho({ userAgent: IPHONE, standalone: false })
    render(<AvisosPush />)

    await waitFor(() =>
      expect(screen.getByText(/Adicione o portal à tela de início/)).toBeInTheDocument()
    )
    expect(screen.queryByText(/Toque para ativar/)).toBeNull()
  })

  it('no iPhone instalado na tela de início, oferece ativar', async () => {
    fingirAparelho({ userAgent: IPHONE, standalone: true })
    render(<AvisosPush />)

    await waitFor(() => expect(screen.getByText(/Toque para ativar/)).toBeInTheDocument())
  })

  it('no Android oferece ativar mesmo sem estar instalado', async () => {
    // O Android não tem a restrição do iPhone — exigir instalação ali seria
    // inventar um obstáculo que a plataforma não impõe.
    fingirAparelho({ userAgent: ANDROID, standalone: false })
    render(<AvisosPush />)

    await waitFor(() => expect(screen.getByText(/Toque para ativar/)).toBeInTheDocument())
  })
})
