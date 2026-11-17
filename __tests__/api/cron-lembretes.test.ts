/**
 * O disparo do lembrete da véspera.
 *
 * O portão é o que mais importa: uma rota de disparo aberta deixaria qualquer
 * pessoa na internet mandar avisos para os pacientes da clínica, com o nome
 * da clínica. Por isso ela falha FECHADA — sem `CRON_SECRET` no ambiente,
 * recusa tudo.
 *
 * Nomes e dados INVENTADOS.
 */

const SEGREDO = 'segredo-de-teste-123'

let linhasDoDia: Record<string, unknown>[] = []
let jaEnviados: { agendamento_id: number }[] = []
const inseridos: number[] = []

// `sql` é usado como template tag pela rota: para `SELECT ... ANY(...)` devolve
// os já enviados; para o INSERT devolve a linha marcada (ou nada, se repetido).
jest.mock('@/lib/db', () => {
  const tag = (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join('?')
    if (texto.includes('INSERT INTO lembretes_enviados')) {
      const id = valores[0] as number
      if (jaEnviados.some((l) => l.agendamento_id === id) || inseridos.includes(id)) return Promise.resolve([])
      inseridos.push(id)
      return Promise.resolve([{ agendamento_id: id }])
    }
    return Promise.resolve(jaEnviados)
  }
  return { __esModule: true, default: tag, initSchema: jest.fn(async () => undefined) }
})

const avisarPaciente: jest.Mock = jest.fn(async () => ({ enviados: 1, removidos: 0, falhas: 0 }))
jest.mock('@/lib/push-envio', () => ({ avisarPaciente: (...a: unknown[]) => avisarPaciente(...a) }))
jest.mock('@/lib/agenda-db', () => ({ agendamentosDoPeriodo: jest.fn(async () => linhasDoDia) }))
jest.mock('@/lib/system-errors', () => ({ logSystemError: jest.fn(async () => undefined) }))

import { POST } from '@/app/api/cron/lembretes/route'

function disparar(cabecalho?: string) {
  return POST(new Request('http://localhost/api/cron/lembretes', {
    method: 'POST',
    headers: cabecalho === undefined ? {} : { 'x-cron-secret': cabecalho },
  }) as never)
}

beforeEach(() => {
  process.env.CRON_SECRET = SEGREDO
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
  // 16/11/2026, 9h de Brasília. Amanhã = 17/11 (terça).
  jest.setSystemTime(new Date('2026-11-16T12:00:00Z'))
  linhasDoDia = [
    { id: 1, patient_id: 10, dia: '2026-11-17', hora: '14:00', status: 'agendado' },
    { id: 2, patient_id: 11, dia: '2026-11-17', hora: '15:00', status: 'desmarcou' },
  ]
  jaEnviados = []
  inseridos.length = 0
  avisarPaciente.mockClear()
})
afterEach(() => { jest.useRealTimers() })

describe('o portão do disparo', () => {
  it('sem o segredo no ambiente, recusa tudo', async () => {
    delete process.env.CRON_SECRET
    const r = await disparar(SEGREDO)
    expect(r.status).toBe(503)
    expect(avisarPaciente).not.toHaveBeenCalled()
  })

  it('sem cabeçalho, 401', async () => {
    expect((await disparar()).status).toBe(401)
    expect(avisarPaciente).not.toHaveBeenCalled()
  })

  it('com segredo errado, 401', async () => {
    expect((await disparar('outra-coisa')).status).toBe(401)
    expect(avisarPaciente).not.toHaveBeenCalled()
  })

  it('segredo de tamanho diferente não derruba a rota', async () => {
    expect((await disparar('x')).status).toBe(401)
  })

  it('espaço ou quebra de linha grudada no valor não impede o disparo', async () => {
    // A causa real de duas falhas seguidas em produção: copiar o valor de um
    // painel costuma trazer um espaço ou um "\n" invisível junto. Os dois
    // lados "parecem" iguais na tela e não são — e ninguém descobre olhando.
    // Espaço em volta nunca faz parte de um segredo, então ignorar é seguro.
    expect((await disparar(` ${SEGREDO} `)).status).toBe(200)
    expect((await disparar(`${SEGREDO}\n`)).status).toBe(200)
    expect((await disparar(`\n${SEGREDO}`)).status).toBe(200)
  })

  it('sujeira no valor do AMBIENTE também é ignorada', async () => {
    // O mesmo acidente acontece do outro lado: o valor salvo no painel do
    // app é que pode estar com o espaço.
    process.env.CRON_SECRET = `${SEGREDO}\n`
    expect((await disparar(SEGREDO)).status).toBe(200)
  })

  it('segredo diferente de verdade continua recusado', async () => {
    // Aparar espaço não pode virar frouxidão: o que muda é só a borda.
    expect((await disparar(`${SEGREDO}x`)).status).toBe(401)
    expect((await disparar(SEGREDO.toUpperCase())).status).toBe(401)
  })

  it('recusa anota o TAMANHO de cada lado na tela de Erros, nunca o conteúdo', async () => {
    // Sem isto, "401" é tudo o que se sabe, e a diferença é invisível. Com o
    // tamanho dos dois lados, um caractere a mais aparece na hora. O conteúdo
    // nunca é gravado: a tela de Erros é lida pela clínica.
    const { logSystemError } = jest.requireMock('@/lib/system-errors') as { logSystemError: jest.Mock }
    logSystemError.mockClear()
    await disparar('valor-errado')

    expect(logSystemError).toHaveBeenCalled()
    const [chave, mensagem, dados] = logSystemError.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(chave).toMatch(/lembretes/)
    const tudo = JSON.stringify([chave, mensagem, dados])
    expect(tudo).not.toContain(SEGREDO)
    expect(tudo).not.toContain('valor-errado')
    expect(dados).toMatchObject({ tamanhoRecebido: 12, tamanhoEsperado: SEGREDO.length })
  })
})

describe('o envio', () => {
  it('avisa quem tem aplicação amanhã, e só esse', async () => {
    const r = await disparar(SEGREDO)
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.dia).toBe('2026-11-17')
    expect(corpo.enviados).toBe(1)
    expect(avisarPaciente).toHaveBeenCalledTimes(1)
    const [paciente, aviso] = avisarPaciente.mock.calls[0] as unknown as [number, { texto: string }]
    expect(paciente).toBe(10)
    expect(aviso.texto).toContain('Terça-feira, às 14h')
  })

  it('rodar duas vezes não manda o aviso de novo', async () => {
    // O agendador pode repetir, e alguém pode abrir a rota na mão. Aviso
    // repetido é o que faz as pessoas desligarem os avisos de vez.
    await disparar(SEGREDO)
    expect(avisarPaciente).toHaveBeenCalledTimes(1)

    jaEnviados = [{ agendamento_id: 1 }]
    avisarPaciente.mockClear()
    const segunda = await disparar(SEGREDO)
    expect((await segunda.json()).enviados).toBe(0)
    expect(avisarPaciente).not.toHaveBeenCalled()
  })

  it('dia sem ninguém marcado não manda nada e não dá erro', async () => {
    linhasDoDia = []
    const r = await disparar(SEGREDO)
    expect(r.status).toBe(200)
    expect((await r.json()).candidatos).toBe(0)
    expect(avisarPaciente).not.toHaveBeenCalled()
  })
})
