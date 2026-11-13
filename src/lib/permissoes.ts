// Regras de permissão PURAS: sem sessão, sem banco, sem next-auth.
//
// POR QUE SEPARADO DE `authz.ts`: aquele módulo importa `@/auth`, que arrasta
// o next-auth inteiro. Qualquer teste que tocasse nele morria antes de rodar,
// então a regra mais consultada do sistema ficava sem rede. Aqui ela é uma
// função de um argumento — e o teste ao lado prova que ela falha FECHADA.

/** O formato mínimo que basta para decidir: o que a sessão carrega. */
export interface UsuarioComPermissoes {
  is_admin?: boolean
  can_estoque?: boolean
}

/**
 * Quem pode mexer no estoque.
 *
 * Errar para o lado permissivo mostra à recepcionista um atalho que termina
 * em recusa depois de ela já ter escaneado os itens; errar para o fechado
 * esconde o atalho de quem tem direito a ele. Por isso ausência de usuário é
 * sempre `false`: sessão meio carregada não vira permissão.
 */
export function podeEstoque(user: UsuarioComPermissoes | null | undefined): boolean {
  return !!user?.is_admin || !!user?.can_estoque
}
