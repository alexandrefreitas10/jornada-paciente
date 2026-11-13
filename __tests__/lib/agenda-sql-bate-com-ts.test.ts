import { readFileSync } from 'fs'
import { join } from 'path'
import { INDICE_FATIA, STATUS_AGENDAMENTO } from '@/lib/agenda-db'
import { DURACOES } from '@/lib/agenda-grade'

// POR QUE ESTE TESTE EXISTE
//
// Três regras da agenda vivem em DOIS lugares cada: uma vez em TypeScript e
// outra no SQL das migrações. O TypeScript não enxerga o SQL, então nada liga
// as cópias — e divergir é silencioso do pior jeito:
//
// - acrescentar um sexto status em TS passa no tsc e na suíte, e só estoura em
//   PRODUÇÃO como erro 23514 da constraint;
// - renomear o índice no SQL faz `ehFatiaOcupada` parar de reconhecer a
//   colisão, e "horário já ocupado" vira erro 500 na cara da recepcionista.
//
// Este teste é o fio que faltava. Ele lê o SQL como texto — não é elegante, e
// é de propósito: a alternativa é não ter ligação nenhuma.

const SQL_DAS_MIGRACOES = readFileSync(join(process.cwd(), 'src/lib/db.ts'), 'utf8')

describe('o SQL das migrações bate com o TypeScript', () => {
  it('o índice que o código procura é o índice que o SQL cria', () => {
    // Se alguém renomear num lado só, `ehFatiaOcupada` devolve false e a
    // colisão de horário deixa de virar 409.
    expect(SQL_DAS_MIGRACOES).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${INDICE_FATIA}`)
  })

  it('o CHECK de status lista exatamente os status do TypeScript', () => {
    const esperado = STATUS_AGENDAMENTO.map((s) => `'${s}'`).join(',')
    expect(SQL_DAS_MIGRACOES).toContain(`CHECK (status IN (${esperado}))`)
  })

  it('o CHECK de duração lista exatamente as durações do TypeScript', () => {
    const esperado = DURACOES.join(', ')
    expect(SQL_DAS_MIGRACOES).toContain(`CHECK (duracao IN (${esperado}))`)
  })

  it('o índice só conta agendamento vivo e deixa o encaixe passar', () => {
    // As duas metades do recorte parcial, que são o coração da regra:
    // remarcado/desmarcado soltam a fatia, e o encaixe da equipe é a exceção
    // deliberada. Apagar qualquer uma muda o comportamento sem quebrar nada.
    expect(SQL_DAS_MIGRACOES).toContain("WHERE status IN ('agendado','atendido') AND NOT encaixe")
  })
})
