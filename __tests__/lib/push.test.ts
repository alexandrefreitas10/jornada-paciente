import { assinaturaMorreu, chaveParaBytes, montarAviso } from '@/lib/push'

describe('chaveParaBytes', () => {
  // A chave VAPID viaja como base64url (com - e _ no lugar de + e /), mas o
  // navegador só aceita bytes crus em `applicationServerKey`.
  it('devolve os 65 bytes de uma chave VAPID', () => {
    const chave = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    expect(chaveParaBytes(chave)).toHaveLength(65)
  })

  it('traduz - e _ do base64url, que o base64 comum não conhece', () => {
    // "a-b_" em base64url é "a+b/" em base64 comum. Sem a troca, o decodificador
    // devolve bytes errados em silêncio — não dá erro, só não funciona.
    const semTroca = Buffer.from('a+b/', 'base64')
    expect(Array.from(chaveParaBytes('a-b_'))).toEqual(Array.from(semTroca))
  })
})

describe('assinaturaMorreu', () => {
  // Quem desinstala o app da tela de início não avisa ninguém: o endereço dele
  // continua gravado e só se revela morto quando o envio falha.
  it('410 e 404 querem dizer que o aparelho não quer mais', () => {
    expect(assinaturaMorreu(410)).toBe(true)
    expect(assinaturaMorreu(404)).toBe(true)
  })

  it('erro passageiro não apaga a inscrição de ninguém', () => {
    // Apagar por 500 ou 429 seria perder o paciente por um soluço do servidor
    // da Apple ou do Google.
    expect(assinaturaMorreu(500)).toBe(false)
    expect(assinaturaMorreu(429)).toBe(false)
    expect(assinaturaMorreu(201)).toBe(false)
  })
})

describe('montarAviso', () => {
  it('leva título, texto e para onde o toque deve abrir', () => {
    const aviso = montarAviso({ titulo: 'Instituto Torres', texto: 'Você tem um documento novo' })
    expect(JSON.parse(aviso)).toEqual({
      titulo: 'Instituto Torres',
      texto: 'Você tem um documento novo',
      url: '/portal/paciente',
    })
  })

  it('aceita abrir numa tela específica', () => {
    const aviso = montarAviso({ titulo: 'a', texto: 'b', url: '/portal/paciente/nps' })
    expect(JSON.parse(aviso).url).toBe('/portal/paciente/nps')
  })
})
