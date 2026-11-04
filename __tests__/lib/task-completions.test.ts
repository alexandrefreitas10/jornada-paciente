// __tests__/lib/task-completions.test.ts
//
// Esta suíte está DESLIGADA, e o arquivo continua aqui de propósito. O motivo
// completo está no topo de `__tests__/lib/patients.test.ts`, que está na mesma
// situação: os testes foram removidos na migração para PostgreSQL, as duas
// funções aqui só falam com o banco, e a suíte do projeto roda sem nenhum.
//
// Marcado como `skip` em vez de apagado para a lacuna continuar aparecendo na
// saída do jest em cada rodada.
//
// Para ligar: aponte `DATABASE_URL` (em `.env.local`) para um Postgres LOCAL de
// teste e troque `describe.skip` por `describe`.

describe.skip('task-completions (desligada: precisa de Postgres local)', () => {
  it('markTaskComplete duas vezes não duplica a marcação', () => {
    // `ON CONFLICT (patient_id, task_key) DO NOTHING` — e é esta chave única
    // que faz o `completed_count` das listas de paciente ser confiável.
  })

  it('unmarkTaskComplete numa tarefa não marcada não faz nada nem quebra', () => {
    // O `DELETE` simplesmente não encontra linha.
  })

  it('marcar e desmarcar devolve o paciente ao estado anterior', () => {
    // Ida e volta, que é o que a tela faz a cada clique na caixinha.
  })

  it('a marcação é por (paciente, tarefa): desmarcar de um não afeta o outro', () => {
    // Os dois filtros do `WHERE` juntos. Se um dia alguém esquecer o
    // `patient_id`, desmarcar uma tarefa a apagaria de todos os pacientes.
  })
})
