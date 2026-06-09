// __tests__/lib/patients.test.ts
import Database from 'better-sqlite3'
import {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient,
} from '@/lib/patients'

// Usa banco em memória para testes isolados
let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  testDb.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      duration TEXT,
      notes TEXT,
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
})

afterEach(() => {
  testDb.close()
})

describe('listPatients', () => {
  it('retorna lista vazia quando não há pacientes', () => {
    const result = listPatients(testDb)
    expect(result).toEqual([])
  })

  it('retorna pacientes com contagem de tarefas concluídas', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('João', '2026-06-01', '3 meses', '')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('consulta_agendada')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('bioimpedancia_info')

    const result = listPatients(testDb)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('João')
    expect(result[0].completed_count).toBe(2)
  })
})

describe('createPatient', () => {
  it('cria paciente e retorna o id', () => {
    const id = createPatient(testDb, { name: 'Maria', start_date: '2026-06-01', duration: '6 meses', notes: 'Sem glúten' })
    expect(id).toBe(1)
  })

  it('rejeita paciente sem nome', () => {
    expect(() => createPatient(testDb, { name: '', start_date: '', duration: '', notes: '' })).toThrow()
  })
})

describe('getPatient', () => {
  it('retorna null para id inexistente', () => {
    const result = getPatient(testDb, 999)
    expect(result).toBeNull()
  })

  it('retorna o paciente com as task_keys concluídas', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Carlos', '2026-06-01', '1 mês', '')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('consulta_agendada')

    const result = getPatient(testDb, 1)
    expect(result?.name).toBe('Carlos')
    expect(result?.completed_task_keys).toContain('consulta_agendada')
  })
})

describe('updatePatient', () => {
  it('atualiza campos do paciente', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Ana', '', '', '')
    updatePatient(testDb, 1, { name: 'Ana Paula', start_date: '2026-07-01', duration: '2 meses', notes: 'Nova obs' })
    const result = getPatient(testDb, 1)
    expect(result?.name).toBe('Ana Paula')
    expect(result?.notes).toBe('Nova obs')
  })
})

describe('deletePatient', () => {
  it('remove o paciente e suas tarefas (cascade)', () => {
    testDb.prepare('INSERT INTO patients (name, start_date, duration, notes) VALUES (?, ?, ?, ?)').run('Pedro', '', '', '')
    testDb.prepare('INSERT INTO task_completions (patient_id, task_key) VALUES (1, ?)').run('consulta_agendada')

    deletePatient(testDb, 1)

    expect(getPatient(testDb, 1)).toBeNull()
    const tasks = testDb.prepare('SELECT * FROM task_completions WHERE patient_id = 1').all()
    expect(tasks).toHaveLength(0)
  })
})
