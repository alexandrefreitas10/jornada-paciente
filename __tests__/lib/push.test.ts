import { assinaturaMorreu, chaveParaBytes, enderecoDeServicoConhecido, montarAviso } from '@/lib/push'

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

describe('enderecoDeServicoConhecido', () => {
  // O endereço chega do NAVEGADOR. Sem esta trava, um paciente autenticado
  // podia gravar um endereço interno da rede e fazer o servidor bater lá a
  // cada aviso — o servidor viraria ferramenta dele (SSRF).
  it('aceita os serviços de push de verdade', () => {
    for (const bom of [
      'https://web.push.apple.com/QAbc123',
      'https://fcm.googleapis.com/fcm/send/abc:123',
      'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      'https://sin.notify.windows.com/w/?token=abc',
    ]) {
      expect(enderecoDeServicoConhecido(bom)).toBe(true)
    }
  })

  it('recusa endereço interno, que é o ataque', () => {
    for (const mau of [
      'http://169.254.169.254/latest/meta-data/',   // metadados da nuvem
      'http://localhost:5432/',
      'https://10.0.0.5/interno',
      'https://evil.example.com/coleta',
    ]) {
      expect(enderecoDeServicoConhecido(mau)).toBe(false)
    }
  })

  it('exige https: http abriria espaço para interceptação', () => {
    expect(enderecoDeServicoConhecido('http://fcm.googleapis.com/fcm/send/a')).toBe(false)
  })

  it('não cai no truque do domínio parecido', () => {
    // "fcm.googleapis.com.evil.com" termina com ".evil.com", não com o
    // domínio real — comparar por "contém" deixaria isso passar.
    expect(enderecoDeServicoConhecido('https://fcm.googleapis.com.evil.com/x')).toBe(false)
    expect(enderecoDeServicoConhecido('https://naoweb.push.apple.com.br/x')).toBe(false)
  })

  it('texto que nem é URL não derruba nada', () => {
    expect(enderecoDeServicoConhecido('nem é url')).toBe(false)
    expect(enderecoDeServicoConhecido('')).toBe(false)
  })
})
