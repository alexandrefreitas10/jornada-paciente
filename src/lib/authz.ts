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
