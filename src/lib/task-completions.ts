import sql from './db'

export async function markTaskComplete(patientId: number, taskKey: string): Promise<void> {
  await sql`
    INSERT INTO task_completions (patient_id, task_key)
    VALUES (${patientId}, ${taskKey})
    ON CONFLICT (patient_id, task_key) DO NOTHING
  `
}

export async function unmarkTaskComplete(patientId: number, taskKey: string): Promise<void> {
  await sql`
    DELETE FROM task_completions WHERE patient_id = ${patientId} AND task_key = ${taskKey}
  `
}
