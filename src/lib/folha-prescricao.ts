// O que conta como "folha na aba Prescrições". PURO: sem banco, sem React.
//
// Mora sozinho num arquivo porque é perguntado de dois lados que precisam
// concordar, e que não se enxergam:
//
//  - `temPrescricao` (agenda-db.ts) decide se a aba Agenda aparece no portal
//    do paciente — é o portão.
//  - `listPatients` (patients.ts) decide quem aparece marcado na lista da
//    clínica — é por ela que a equipe sabe de quem ainda falta subir a folha.
//
// Enquanto o valor estava escrito à mão nos dois, nada impedia um de mudar
// sem o outro, e a divergência seria silenciosa: a lista diria "liberado"
// para quem a agenda continua barrando, e ninguém descobriria até um paciente
// reclamar que a aba não aparece.

/**
 * O tipo de arquivo da aba **Prescrições**.
 *
 * **Não é `'prescription'`**, que é o anexo da aba Evolução (ver
 * `EvolutionTab.tsx`). Os dois existem no banco, os nomes são quase iguais e
 * só este abre a agenda do paciente. Trocar um pelo outro não dá erro em lugar
 * nenhum — só passa a liberar, ou barrar, as pessoas erradas.
 */
export const TIPO_FOLHA_PRESCRICAO = 'prescricao'
