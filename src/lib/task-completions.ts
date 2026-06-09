// src/lib/task-completions.ts
import Database from 'better-sqlite3'

export function markTaskComplete(
  db: Database.Database,
  patientId: number,
  taskKey: string
): void {
  db.prepare(
    'INSERT OR IGNORE INTO task_completions (patient_id, task_key) VALUES (?, ?)'
  ).run(patientId, taskKey)
}

export function unmarkTaskComplete(
  db: Database.Database,
  patientId: number,
  taskKey: string
): void {
  db.prepare(
    'DELETE FROM task_completions WHERE patient_id = ? AND task_key = ?'
  ).run(patientId, taskKey)
}
