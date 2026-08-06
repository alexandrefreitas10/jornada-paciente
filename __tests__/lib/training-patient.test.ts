// __tests__/lib/training-patient.test.ts
import { breaksCharacter, splitBubbles, detectEnding } from '@/lib/training/patient'

describe('training/patient — quebra de personagem', () => {
  it('pega o paciente falando de si em terceira pessoa', () => {
    // O erro real observado no agente de mercado.
    expect(breaksCharacter('Mas sinceramente, Lúcia ainda está na dúvida', 'Lúcia Mendes')).toBe(true)
    expect(breaksCharacter('Ana ficou insegura com o valor', 'Ana Costa')).toBe(true)
  })

  it('não confunde o paciente se apresentando com quebra de personagem', () => {
    expect(breaksCharacter('oi, aqui é a Ana', 'Ana Costa')).toBe(false)
    expect(breaksCharacter('meu nome é Ana Costa', 'Ana Costa')).toBe(false)
  })

  it('pega vazamento de avaliação no meio da conversa', () => {
    expect(breaksCharacter('AVALIAÇÃO: 1. ACOLHIMENTO (1-10): 8', 'Ana')).toBe(true)
    expect(breaksCharacter('NOTA FINAL: 7.4/10', 'Ana')).toBe(true)
    expect(breaksCharacter('🔴 SIMULAÇÃO ENCERRADA', 'Ana')).toBe(true)
    expect(breaksCharacter('💡 DICA PRÁTICA: na próxima vez...', 'Ana')).toBe(true)
  })

  it('pega o rótulo de narrador vazando', () => {
    expect(breaksCharacter('Paciente (por WhatsApp): oi tudo bem?', 'Ana')).toBe(true)
  })

  it('deixa passar mensagem normal de paciente', () => {
    expect(breaksCharacter('oi, qnto custa a consulta?', 'Ana Costa')).toBe(false)
    expect(breaksCharacter('vcs atendem convenio??', 'Ana Costa')).toBe(false)
  })
})

describe('training/patient — balões', () => {
  it('separa balões por linha em branco', () => {
    expect(splitBubbles('oi\n\nqnto é a consulta?')).toEqual(['oi', 'qnto é a consulta?'])
  })

  it('descarta linhas vazias e espaços', () => {
    expect(splitBubbles('  oi  \n\n\n  tudo bem?  \n\n')).toEqual(['oi', 'tudo bem?'])
  })

  it('texto sem quebra vira um balão só', () => {
    expect(splitBubbles('boa tarde')).toEqual(['boa tarde'])
  })

  it('limita a 3 balões por turno', () => {
    expect(splitBubbles('a\n\nb\n\nc\n\nd\n\ne')).toHaveLength(3)
  })

  it('remove token especial vazado pelo modelo', () => {
    // Aconteceu de verdade: "Tô bem dividida ainda...<|eos|>"
    expect(splitBubbles('to bem dividida ainda...<|eos|>')).toEqual(['to bem dividida ainda...'])
  })
})

describe('training/patient — desfecho', () => {
  it('extrai o marcador de desfecho e o remove do texto', () => {
    const r = detectEnding('perfeito, pode marcar quarta as 16h entao\n[[FIM:AGENDOU]]')
    expect(r.outcome).toBe('AGENDOU')
    expect(r.text).toBe('perfeito, pode marcar quarta as 16h entao')
  })

  it('sem marcador, a conversa continua', () => {
    const r = detectEnding('e quanto custa mesmo?')
    expect(r.outcome).toBeNull()
    expect(r.text).toBe('e quanto custa mesmo?')
  })

  it('ignora marcador com desfecho inválido', () => {
    const r = detectEnding('tchau\n[[FIM:QUALQUERCOISA]]')
    expect(r.outcome).toBeNull()
  })
})
