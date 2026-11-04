// __tests__/lib/patients.test.ts
//
// Esta suíte está DESLIGADA, e o arquivo continua aqui de propósito.
//
// Os testes desta lib foram removidos na migração para PostgreSQL e nunca
// voltaram: toda função aqui fala com o banco, e a suíte do projeto roda sem
// nenhum. Antes, o arquivo tinha só um comentário e um `export {}`, e o jest o
// reprovava com "Your test suite must contain at least one test" — uma suíte
// vermelha que não apontava defeito nenhum, e que por isso virou ruído que
// todo mundo aprendeu a ignorar.
//
// Marcado como `skip` em vez de apagado para a lacuna continuar APARECENDO: o
// jest lista estes nomes como "skipped" em cada rodada. Apagar o arquivo
// deixaria a saída verde e silenciosa, e a cobertura que falta não voltaria a
// ser lembrada por ninguém.
//
// Para ligar: aponte `DATABASE_URL` (em `.env.local`) para um Postgres LOCAL de
// teste — NUNCA o de produção, que é onde estes testes apagariam paciente de
// verdade — e troque `describe.skip` por `describe`.
//
// Os nomes abaixo não são invenção: são os comportamentos não óbvios que hoje
// só existem como comentário em `src/lib/patients.ts`, dois deles escritos
// depois de bug real em produção.

describe.skip('patients (desligada: precisa de Postgres local — ver o topo do arquivo)', () => {
  it('listPatients não traz paciente apagado nem arquivado', () => {
    // `WHERE p.deleted_at IS NULL AND p.archived_at IS NULL`.
  })

  it('updatePatient com telefone em branco NÃO apaga o telefone gravado', () => {
    // `phone = COALESCE(..., phone)`. Em branco quer dizer "não mexe": uma aba
    // aberta antes de alguém preencher o número ainda carrega `phone = null`, e
    // salvar o nome por ali zerava o que tinha acabado de ser coletado.
  })

  it('updatePatient sem tipo NÃO devolve a cliente de estética para nutrologia', () => {
    // Mesma ideia do telefone, com `tipo = COALESCE(...)`. Sem isso, uma aba
    // antiga do navegador convertia o tipo só por salvar uma correção de nome.
  })

  it('updatePatient recusa nome vazio', () => {
    // `throw new Error('name is required')` antes de tocar no banco.
  })

  it('deletePatient só marca deleted_at, e restorePatient desfaz', () => {
    // Apagar é reversível aqui; nada sai da tabela.
  })

  it('updatePatientPhone muda só o telefone', () => {
    // Existe separada justamente para a rota de perfil do portal não regravar
    // nascimento e e-mail junto.
  })
})
