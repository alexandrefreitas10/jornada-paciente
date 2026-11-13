// Quem enxerga a aba Agenda no portal, enquanto ela está em piloto.
//
// COMO LIGAR E DESLIGAR, sem deploy — painel do Render, variável
// `AGENDA_PORTAL_PACIENTES`:
//
//   (ausente ou vazia)  → NINGUÉM. Padrão.
//   96                  → só o paciente 96
//   96,55,77            → esses três
//   todos               → todo mundo (fim do piloto)
//
// POR QUE O PADRÃO É "NINGUÉM", e não o contrário:
//
// Eu tinha escrito ao contrário — ausente liberava geral — com o argumento de
// que esse é o estado final desejado. Estava errado, e o erro era concreto: no
// instante em que o deploy entrasse, a aba abriria para TODOS os pacientes com
// folha em Prescrições, antes de alguém conseguir cadastrar a variável. O
// oposto de um piloto.
//
// Um padrão que falha ABERTO numa funcionalidade nova, num sistema de saúde,
// é a escolha errada mesmo quando o estado final é "aberto". Abrir é um ato;
// esquecer não pode ser.

/** O valor que encerra o piloto e libera todo mundo. */
const TODOS = 'todos'

/** `true` quando este paciente pode ver a aba Agenda no portal. */
export function pacientePodeVerAgenda(
  patientId: number,
  lista: string | undefined = process.env.AGENDA_PORTAL_PACIENTES,
): boolean {
  const cru = (lista ?? '').trim()
  if (!cru) return false
  if (cru.toLowerCase() === TODOS) return true
  return cru
    .split(',')
    .map((p) => Number(p.trim()))
    .some((id) => Number.isInteger(id) && id === patientId)
}
