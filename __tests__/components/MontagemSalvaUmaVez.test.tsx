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
  gerarMontagem: jest.fn(),
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

// Blobs distinguíveis: o segundo teste exige que o PNG vá para o download e o
// JPEG para o servidor, e não um no lugar do outro. O retorno é definido no
// `beforeEach`, e não na fábrica do `jest.mock`, porque a fábrica roda no
// import do módulo — antes de qualquer `const` deste arquivo existir.
const PNG_BAIXADO = new Blob(['conteudo-png'], { type: 'image/png' })
const JPEG_GUARDADO = new Blob(['conteudo-jpeg'], { type: 'image/jpeg' })

beforeEach(() => {
  jest.clearAllMocks()
  canvas.gerarMontagem.mockResolvedValue({
    png: PNG_BAIXADO, guardada: JPEG_GUARDADO, thumb: new Blob(['thumb']), largura: 100, altura: 100,
  })
  canvas.salvarMontagem.mockResolvedValue(42)
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

it('baixa o PNG e manda o JPEG para o servidor, nunca o contrário', async () => {
  // O PNG da mesma montagem passa de 60 MB com foto de celular inteira, e o
  // limite de corpo da requisição é 30 MB: acima dele o corpo é cortado em
  // silêncio e a montagem não grava, depois de o download já ter acontecido.
  // Foi o que fez 7 de 14 montagens sumirem no primeiro dia de uso.
  const user = userEvent.setup({ delay: null })
  render(<FilesTab patientId={1} fileType="photo" initialFiles={FOTOS} />)

  await user.click(screen.getByRole('button', { name: /comparar fotos/i }))
  await user.click(screen.getByAltText('a.jpg'))
  await user.click(screen.getByAltText('b.jpg'))
  await user.click(screen.getByRole('button', { name: /enquadrar e comparar/i }))
  await user.click(screen.getByRole('button', { name: /confirmar enquadramento/i }))
  await user.click(screen.getByRole('button', { name: /baixar/i }))

  await waitFor(() => expect(canvas.salvarMontagem).toHaveBeenCalledTimes(1))
  expect(canvas.salvarMontagem.mock.calls[0][0].imagem).toBe(JPEG_GUARDADO)
  expect(canvas.baixarBlob.mock.calls[0][0]).toBe(PNG_BAIXADO)
}, 30000)

it('nomeia o arquivo baixado com o nome do paciente', async () => {
  // A montagem não escreve o nome na imagem e costuma cortar o rosto. Sem o
  // nome no arquivo, 14 downloads viram 14 arquivos indistinguíveis — foi o
  // que aconteceu com o dono quando precisou saber quais refazer.
  const user = userEvent.setup({ delay: null })
  render(<FilesTab patientId={1} patientName="José Ângelo da Silva" fileType="photo" initialFiles={FOTOS} />)

  await user.click(screen.getByRole('button', { name: /comparar fotos/i }))
  await user.click(screen.getByAltText('a.jpg'))
  await user.click(screen.getByAltText('b.jpg'))
  await user.click(screen.getByRole('button', { name: /enquadrar e comparar/i }))
  await user.click(screen.getByRole('button', { name: /confirmar enquadramento/i }))
  await user.click(screen.getByRole('button', { name: /baixar/i }))

  await waitFor(() => expect(canvas.baixarBlob).toHaveBeenCalled())
  expect(canvas.baixarBlob.mock.calls[0][1]).toBe('comparacao-antes-depois-jose-angelo-da-silva.png')
}, 30000)
