import { podeEstoque } from '@/lib/permissoes'

// A regra existe em UM lugar agora, mas é consultada em várias telas — entre
// elas o atalho da agenda, que leva a recepcionista a uma tela de estoque que
// recusaria a ação dela. Errar para o lado permissivo mostra um caminho sem
// saída; errar para o fechado esconde o atalho de quem pode usá-lo.
describe('podeEstoque', () => {
  it('admin pode', () => {
    expect(podeEstoque({ is_admin: true })).toBe(true)
  })

  it('quem tem a permissão de estoque pode', () => {
    expect(podeEstoque({ can_estoque: true })).toBe(true)
  })

  it('quem não tem nenhuma das duas não pode', () => {
    expect(podeEstoque({ is_admin: false, can_estoque: false })).toBe(false)
    expect(podeEstoque({})).toBe(false)
  })

  it('falha FECHADA quando não há usuário', () => {
    // Sessão ausente ou meio carregada não pode virar permissão.
    expect(podeEstoque(null)).toBe(false)
    expect(podeEstoque(undefined)).toBe(false)
  })
})
