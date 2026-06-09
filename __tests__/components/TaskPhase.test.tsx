// __tests__/components/TaskPhase.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskPhase } from '@/components/TaskPhase'

const phase = {
  key: 'pre_consulta',
  label: 'Pré-consulta',
  icon: '📋',
  tasks: [
    { key: 'consulta_agendada', label: 'Consulta agendada' },
    { key: 'bioimpedancia_info', label: 'Informações da bioimpedância' },
  ],
}

describe('TaskPhase', () => {
  it('exibe o nome da fase', () => {
    render(<TaskPhase phase={phase} completedKeys={[]} patientId={1} />)
    expect(screen.getByText('Pré-consulta')).toBeInTheDocument()
  })

  it('exibe todas as tarefas da fase', () => {
    render(<TaskPhase phase={phase} completedKeys={[]} patientId={1} />)
    expect(screen.getByText('Consulta agendada')).toBeInTheDocument()
    expect(screen.getByText('Informações da bioimpedância')).toBeInTheDocument()
  })

  it('marca tarefa como concluída quando já está em completedKeys', () => {
    render(<TaskPhase phase={phase} completedKeys={['consulta_agendada']} patientId={1} />)
    const checkbox = screen.getAllByRole('checkbox')[0]
    expect(checkbox).toBeChecked()
  })

  it('chama onToggle ao clicar num checkbox', async () => {
    const onToggle = jest.fn()
    render(<TaskPhase phase={phase} completedKeys={[]} patientId={1} onToggle={onToggle} />)
    await userEvent.click(screen.getAllByRole('checkbox')[0])
    expect(onToggle).toHaveBeenCalledWith('consulta_agendada', true)
  })
})
