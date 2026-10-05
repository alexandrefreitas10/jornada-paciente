# Telefone do paciente

**Data:** 2026-10-05
**Status:** aguardando revisão do dono

## Problema

A clínica quer automatizar a mensagem semanal de quem está em tratamento. Nada
disso funciona sem o telefone: **são 92 pacientes em tratamento e 4 telefones
cadastrados** (4 de 169 no total).

E o motivo não é a equipe esquecer de preencher: **não existe campo de telefone
em nenhuma tela da clínica**. O formulário de "+ Novo Paciente" pede nome, data
de início, duração e observações. O único lugar do sistema onde um telefone pode
ser digitado é a tela **Perfil do portal do paciente**, preenchida pelo próprio
paciente — e quase ninguém entra lá para editar o perfil.

Este trabalho é pré-requisito de qualquer caminho de automação (API do Support
CRM, campanha por planilha ou envio manual) e não depende de nenhuma decisão
sobre eles.

## Contexto do código hoje

- A coluna `patients.phone TEXT` **já existe** (`src/lib/db.ts:328`). Não há
  migração neste trabalho.
- Quem escreve nela é só `POST /api/patients/[id]/profile`, do portal. Essa rota
  chama `updatePatientProfile`, que grava `birth_date`, `phone` e `email`
  **de uma vez, sem merge**: chamada com apenas o telefone, apagaria a data de
  nascimento e o e-mail. Por isso ela **não** será reaproveitada pela equipe.
- `PatientInput` e `createPatient` não têm telefone.
- `PUT /api/patients/[id]` existe, mas nenhuma tela do projeto o chama.
- `PatientRow` não declara `phone`, embora `getPatient` faça `SELECT *` — o dado
  chega em tempo de execução, mas o TypeScript não enxerga.
- O cabeçalho da ficha (`PatientDetailClient.tsx:116-123`) tem avatar, nome e a
  linha "Início: … · duração".
- `listarEmTratamento` devolve `PacienteEmTratamento` sem telefone.
- 67 pacientes têm acesso ao portal; 43 têm e-mail.

## Comportamento

### 1. Telefone obrigatório no cadastro de paciente novo

Decisão do dono: **trava mesmo**.

- O formulário "+ Novo Paciente" ganha o campo "Telefone", obrigatório. O botão
  de salvar fica bloqueado enquanto o número não for válido, dizendo o que falta.
- `POST /api/patients` passa a responder **400** sem telefone válido. A trava não
  é só da tela.
- Consequência aceita pelo dono: não dá para cadastrar um paciente sem ter o
  número na mão naquele momento.

### 2. Telefone na ficha do paciente

No cabeçalho da ficha, abaixo do nome, junto da linha de "Início":

- com telefone: mostra o número formatado — `(62) 98149-1277`;
- sem telefone: mostra **"sem telefone"** em destaque discreto, porque isso agora
  é uma pendência, não um campo vazio qualquer.

Clicar abre a edição ali mesmo, sem sair da página. Salvou, fica. É o lugar
oficial do dado e serve para qualquer paciente, esteja em tratamento ou não.

### 3. Atalho no card da aba Em tratamento

É onde os 92 vão ser preenchidos rápido, porque é a tela que a equipe abre
justamente para cuidar de quem precisa receber mensagem.

- Card de quem está sem telefone aparece marcado, com o mesmo campo de preencher
  dentro do próprio card.
- Acima da lista, um contador: **"12 em tratamento ainda sem telefone"**. Some
  sozinho quando chega a zero.
- O contador conta as pessoas em tratamento (🟢🟡🔴 e 🔵), não a lista filtrada da
  sub-aba aberta — senão o número mudaria a cada clique e não serviria para
  medir progresso.

### 4. O que é um telefone válido

Só os dígitos contam. O que o usuário digita pode vir de qualquer jeito —
`(62) 98149-1277`, `62981491277`, `+55 62 98149-1277` — e é limpo antes de
validar.

| Regra | Vale |
|---|---|
| 11 dígitos com DDD e 9 na frente do número | celular — `62981491277` |
| 10 dígitos com DDD | fixo — `6232411277` |
| `55` na frente de um número de 12 ou 13 dígitos | o `55` é removido |
| DDD entre 11 e 99 | fora disso, recusa |
| 11 dígitos cujo 3º dígito não é `9` | recusa |
| menos de 10 ou mais de 11 dígitos (após tirar o 55) | recusa |

**Guarda só os dígitos com DDD**, sem o `55` e sem formatação. A tela formata na
hora de mostrar.

O motivo de guardar cru: o formato que o Support CRM espera ainda não está
confirmado, e dígito puro converte para qualquer formato depois sem precisar
reprocessar a base.

### 5. O que não muda

- A tela **Perfil do portal** continua como está. O paciente segue podendo
  editar o próprio telefone, e a rota dele não é tocada.
- **Nenhum telefone existente é alterado.** Os 4 que já estão lá foram digitados
  livremente pelo paciente e ficam como estão; a normalização vale para o que for
  gravado daqui em diante. A formatação de exibição devolve o valor intacto
  quando ele não tem 10 nem 11 dígitos, então um número antigo em formato
  esquisito aparece como foi digitado, sem quebrar a tela.

### Fora do escopo

- A integração com o Support CRM (API, campanha, webhook) — spec própria, depois
  que a documentação da API chegar.
- Verificar se o número existe no WhatsApp.
- Telefone de responsável ou segundo contato.
- Juntar os 3 pares de cadastros duplicados — assunto separado, já levantado.
- Importar telefones de qualquer outra fonte.

## Arquitetura

### Regras puras — `src/lib/telefone.ts` (novo)

Sem banco e sem React, para as fronteiras serem testadas sem depender de tela.

```typescript
/** Só os dígitos, e sem o 55 do Brasil quando ele sobra na frente. */
export function digitosTelefone(texto: string): string

export type ResultadoTelefone =
  | { ok: true; digitos: string }
  | { ok: false; motivo: string }

/** Aceita 10 (fixo) ou 11 (celular, 3º dígito 9) com DDD de 11 a 99. */
export function validarTelefone(texto: string): ResultadoTelefone

/** "62981491277" → "(62) 98149-1277". Valor que não casa volta intacto. */
export function formatarTelefone(valor: string | null): string
```

### Banco

Nenhuma migração. `patients.phone` já existe.

### Servidor

- `PatientInput` ganha `phone: string`; `createPatient` grava a coluna.
- `POST /api/patients` valida com `validarTelefone` e responde 400 com o motivo.
- **`PATCH /api/patients/[id]/phone`** (novo) — altera **só** o telefone.
  Não reaproveita a rota de perfil justamente porque ela regravaria nascimento e
  e-mail. Valida com a mesma função da tela e registra em auditoria via
  `logAudit`.
  Acesso: as rotas de paciente deste projeto se apoiam no `proxy.ts`, que dá
  acesso completo a sessões da equipe e limita a sessão do portal aos próprios
  GETs e a quatro POSTs — um PATCH vindo do portal não passa. A rota nova segue
  o mesmo padrão das irmãs, sem guarda própria.
- `PatientRow` ganha `phone: string | null`.
- `listarEmTratamento` passa a devolver `telefone: string | null`, e
  `PacienteEmTratamento` ganha o campo.

### Interface

- `src/components/NewPatientButton.tsx` — campo obrigatório, botão travado,
  mensagem do que falta.
- `src/components/PatientDetailClient.tsx` — linha de telefone editável no
  cabeçalho.
- `src/app/relatorios/EmTratamento.tsx` — marca de "sem telefone" no card, campo
  de preencher no próprio card e contador acima da lista.

### Testes

- **Puros** (`__tests__/lib/telefone.test.ts`): cada linha da tabela da seção 4;
  formatação de 10 e 11 dígitos; valor antigo em formato livre voltando intacto
  da formatação; vazio e nulo.
- **Componente** (`__tests__/components/EmTratamento.test.tsx`, que já existe):
  card sem telefone mostra a marca e o campo; o contador aparece com o número
  certo e some quando ninguém está sem telefone.
- `NewPatientButton` e `PatientDetailClient` não têm teste hoje; as mudanças
  deles entram por revisão de código, como já se fez com `EstoqueClient`.
