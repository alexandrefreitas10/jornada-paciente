import { auth } from '@/auth'

// Retorna true se a sessão de staff atual é admin. Use no início de handlers
// sensíveis (gestão de usuários, exclusão permanente de auditoria).
export async function isAdminSession(): Promise<boolean> {
  const session = await auth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(session?.user as any)?.is_admin
}

// Retorna true se a sessão de staff atual pode mexer no estoque (admin ou
// permissão can_estoque). Use nas rotas de mutação de estoque.
export async function canEstoqueSession(): Promise<boolean> {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_estoque?: boolean } | undefined
  return !!u?.is_admin || !!u?.can_estoque
}

// Helpers de autorização por propriedade (defesa contra IDOR).
//
// O proxy garante que o paciente do portal só acessa /api/patients/{seuProprioId}/*.
// Estas funções fecham o vão: garantem que o SUB-RECURSO (arquivo, termo, sessão...)
// realmente pertence ao paciente do path — senão um id de sub-recurso arbitrário
// vazaria dados de outro paciente.

/** Retorna true (e estreita o tipo) se o recurso pertence ao paciente indicado. */
export function ownsResource<T extends { patient_id: number }>(
  resource: T | null | undefined,
  patientId: number
): resource is T {
  return !!resource && resource.patient_id === patientId
}
