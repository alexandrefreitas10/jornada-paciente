import sql, { initSchema } from './db'

// `initSchema()` nas duas funções, como em toda lib de banco deste projeto.
// Faltava aqui, e esta era a única lib em que NENHUM chamador cobria a falta: a
// rota `/api/patients/[id]/tasks/[key]` vai direto para o INSERT sem migrar.
// Num banco já criado não dava problema — a tabela existia —, mas num banco
// novo (ambiente novo, Postgres local de teste) marcar tarefa era a primeira
// consulta do processo e encontrava a tabela inexistente.
//
// Chamar de novo é barato: `initSchema` é memoizado por processo.

export async function markTaskComplete(patientId: number, taskKey: string): Promise<void> {
  await initSchema()
  await sql`
    INSERT INTO task_completions (patient_id, task_key)
    VALUES (${patientId}, ${taskKey})
    ON CONFLICT (patient_id, task_key) DO NOTHING
  `
}

export async function unmarkTaskComplete(patientId: number, taskKey: string): Promise<void> {
  await initSchema()
  await sql`
    DELETE FROM task_completions WHERE patient_id = ${patientId} AND task_key = ${taskKey}
  `
}
