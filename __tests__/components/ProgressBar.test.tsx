// __tests__/components/ProgressBar.test.tsx
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/ProgressBar'

describe('ProgressBar', () => {
  it('exibe contagem correta', () => {
    render(<ProgressBar completed={5} total={18} />)
    expect(screen.getByText('5 / 18 tarefas')).toBeInTheDocument()
  })

  it('barra tem largura proporcional', () => {
    const { container } = render(<ProgressBar completed={9} total={18} />)
    const bar = container.querySelector('[data-testid="progress-fill"]')
    expect(bar).toHaveStyle('width: 50%')
  })

  it('usa cor verde quando todas concluídas', () => {
    const { container } = render(<ProgressBar completed={18} total={18} />)
    const bar = container.querySelector('[data-testid="progress-fill"]')
    expect(bar?.className).toContain('bg-green-500')
  })
})
