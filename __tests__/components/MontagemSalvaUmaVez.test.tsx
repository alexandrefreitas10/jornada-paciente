// __tests__/components/MontagemSalvaUmaVez.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilesTab } from '@/components/FilesTab'

// Nomes inventados: foto e nome de paciente real nunca entram em teste.
const FOTOS = [
  { id: 1, original_name: 'a.jpg', url: 'blob:a', created_at: '2026-09-01T12:00:00.000Z', file_type: 'photo' },
  { id: 2, original_name: 'b.jpg', url: 'blob:b', created_at: '2026-10-01T12:00:00.000Z', file_type: 'photo' },
]

// `DeletedItemsButton`, dentro de FilesTab, usa `useRouter` — sem App Router
// montado o render nem começa. Nada nesta suíte navega.
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

jest.mock('@/lib/montagem-canvas', () => ({
  gerarMontagem: jest.fn().mockResolvedValue({
    png: new Blob(['png']), thumb: new Blob(['jpg']), largura: 100, altura: 100,
  }),
  baixarBlob: jest.fn(),
  salvarMontagem: jest.fn().mockResolvedValue(42),
}))

const canvas = jest.requireMock('@/lib/montagem-canvas')

// jsdom não baixa nem decodifica imagem nenhuma: o `onload` do `Image` real
// nunca dispararia e a montagem ficaria esperando para sempre. Esta Image falsa
// carrega na hora, com medidas MAIORES QUE ZERO — que é a condição que o
// componente exige antes de chamar `gerarMontagem`.
class ImagemFalsa {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 1000
  naturalHeight = 2000
  set src(_valor: string) { setTimeout(() => this.onload?.(), 0) }
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['foto']),
  })) as unknown as typeof fetch
  global.Image = ImagemFalsa as unknown as typeof Image
  URL.createObjectURL = jest.fn(() => 'blob:falsa')
  URL.revokeObjectURL = jest.fn()
})

// Timeout maior que o padrão de 5s: são 7 cliques e dois ciclos assíncronos, e
// com a suíte toda rodando em paralelo isso passava dos 5s em máquina carregada
// — a suíte falhava por lentidão, não por comportamento errado.
it('dois cliques baixam duas vezes e gravam UMA', async () => {
  // `delay: null` tira a espera artificial entre as teclas/cliques do userEvent.
  const user = userEvent.setup({ delay: null })
  render(<FilesTab patientId={1} fileType="photo" initialFiles={FOTOS} />)

  await user.click(screen.getByRole('button', { name: /comparar fotos/i }))
  await user.click(screen.getByAltText('a.jpg'))
  await user.click(screen.getByAltText('b.jpg'))
  await user.click(screen.getByRole('button', { name: /enquadrar e comparar/i }))
  await user.click(screen.getByRole('button', { name: /confirmar enquadramento/i }))

  const salvar = screen.getByRole('button', { name: /baixar/i })
  await user.click(salvar)
  await waitFor(() => expect(canvas.salvarMontagem).toHaveBeenCalledTimes(1))
  await user.click(salvar)
  await waitFor(() => expect(canvas.baixarBlob).toHaveBeenCalledTimes(2))

  expect(canvas.salvarMontagem).toHaveBeenCalledTimes(1)
}, 30_000)
