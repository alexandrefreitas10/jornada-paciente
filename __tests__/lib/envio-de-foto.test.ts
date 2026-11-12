import { LIMITE_FOTO_MB, recusaDeEnvio } from '@/lib/envio-de-foto'

const MB = 1024 * 1024
const arquivo = (name: string, size: number) => ({ name, size })

describe('recusaDeEnvio', () => {
  it('deixa passar foto de celular, que é o caso normal', () => {
    expect(recusaDeEnvio(arquivo('IMG_4821.HEIC', 4 * MB))).toBeNull()
  })

  it('aceita exatamente no limite', () => {
    expect(recusaDeEnvio(arquivo('foto.jpg', LIMITE_FOTO_MB * MB))).toBeNull()
  })

  it('recusa um byte acima do limite', () => {
    // O servidor carrega TRÊS cópias do arquivo na memória antes de mandar ao
    // S3. Arquivo grande estourou a memória da instância e derrubou o sistema
    // inteiro — confirmado pelo aviso do Render em 12/11/2026.
    expect(recusaDeEnvio(arquivo('foto.jpg', LIMITE_FOTO_MB * MB + 1))).not.toBeNull()
  })

  it('a recusa diz o nome, o tamanho e o limite — senão a pessoa não sabe o que fazer', () => {
    const recusa = recusaDeEnvio(arquivo('VIDEO_0012.MOV', 180 * MB))
    expect(recusa).toContain('VIDEO_0012.MOV')
    expect(recusa).toContain('180')
    expect(recusa).toContain(String(LIMITE_FOTO_MB))
  })

  it('recusa arquivo vazio, que sobe sem erro e não abre depois', () => {
    expect(recusaDeEnvio(arquivo('vazio.jpg', 0))).not.toBeNull()
  })

  it('arredonda o tamanho para a pessoa ler, não para o byte', () => {
    const recusa = recusaDeEnvio(arquivo('f.jpg', Math.round(23.456 * MB)))
    expect(recusa).toContain('23,5')
  })
})
