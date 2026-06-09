// __tests__/lib/task-definitions.test.ts
import { TASK_PHASES, ALL_TASK_KEYS } from '@/lib/task-definitions'

describe('task-definitions', () => {
  it('tem exatamente 6 fases', () => {
    expect(TASK_PHASES).toHaveLength(6)
  })

  it('tem exatamente 18 tarefas no total', () => {
    const total = TASK_PHASES.reduce((sum, phase) => sum + phase.tasks.length, 0)
    expect(total).toBe(18)
  })

  it('ALL_TASK_KEYS tem 18 itens únicos', () => {
    expect(ALL_TASK_KEYS).toHaveLength(18)
    expect(new Set(ALL_TASK_KEYS).size).toBe(18)
  })

  it('cada tarefa tem key e label', () => {
    for (const phase of TASK_PHASES) {
      for (const task of phase.tasks) {
        expect(task.key).toBeTruthy()
        expect(task.label).toBeTruthy()
      }
    }
  })
})
