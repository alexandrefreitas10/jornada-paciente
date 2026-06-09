// __tests__/lib/task-completions.test.ts
import Database from 'better-sqlite3'
import { markTaskComplete, unmarkTaskComplete } from '@/lib/task-completions'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  testDb.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT, duration TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(patient_id, task_key)
    );
  `)
  testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Teste', '', '', '')
})

afterEach(() => { testDb.close() })

describe('markTaskComplete', () => {
  it('insere registro de conclusão', () => {
    markTaskComplete(testDb, 1, 'consulta_agendada')
    const row = testDb.prepare('SELECT * FROM task_completions WHERE patient_id = 1 AND task_key = ?').get('consulta_agendada')
    expect(row).toBeTruthy()
  })

  it('não falha se tarefa já estiver marcada (idempotente)', () => {
    markTaskComplete(testDb, 1, 'consulta_agendada')
    expect(() => markTaskComplete(testDb, 1, 'consulta_agendada')).not.toThrow()
  })
})

describe('unmarkTaskComplete', () => {
  it('remove registro de conclusão', () => {
    markTaskComplete(testDb, 1, 'consulta_agendada')
    unmarkTaskComplete(testDb, 1, 'consulta_agendada')
    const row = testDb.prepare('SELECT * FROM task_completions WHERE patient_id = 1 AND task_key = ?').get('consulta_agendada')
    expect(row).toBeUndefined()
  })

  it('não falha se tarefa não estava marcada (idempotente)', () => {
    expect(() => unmarkTaskComplete(testDb, 1, 'consulta_agendada')).not.toThrow()
  })
})
