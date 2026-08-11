# Código de acesso ao Portal do Paciente — Design Spec

## Objetivo

Trocar o convite por link (UUID) por um **código curto de 6 caracteres**, ditável por
telefone e imune ao que o WhatsApp faz com URLs. O paciente digita o código, escolhe o
próprio e-mail e uma senha, e entra.

O mesmo mecanismo serve como redefinição de senha: a secretária gera um código novo, a
senha antiga é apagada, o paciente escolhe outra.

## O problema, medido

No banco de produção, em 10/08/2026:

| | |
|---|---|
| Contas de portal | 38 |
| Ativadas (têm senha) | 32 |
| **Convites enviados e nunca ativados** | **6 (16%)** |

Seis pacientes receberam o link e não conseguiram entrar. As causas conhecidas, todas
observadas antes no projeto irmão (Run Coach, memória `link-convite-aluno`):

- o WhatsApp cola pontuação no fim da URL e o link quebra
- host cru virando `localhost` no link gerado
- a mensagem de erro única — *"link inválido ou já utilizado"* — não distingue quem
  digitou errado de quem já ativou, e o paciente conclui que o sistema quebrou

Some-se a isso o e-mail digitado pela secretária: se ela erra (`@gmial.com`), o paciente
tenta entrar com o e-mail correto dele e nada funciona, sem explicação.

## Decisões tomadas e por quê

**Código curto em vez de link.** É a abordagem já validada no Run Coach. O alfabeto exclui
caracteres que se confundem ao ler ou ditar: sem `O`/`0`, `I`/`1`/`L`, `S`/`5`, `U`/`V`.
Sobram 27 símbolos (`ABCDEFGHJKMNPQRTWXYZ2346789`); 6 posições dão ~387 milhões de
combinações.

**Senha continua existindo.** Foi escolha explícita do dono do produto. A alternativa
avaliada — link permanente + data de nascimento, sem senha nenhuma — resolveria também o
esquecimento de senha, mas foi recusada pelo risco de dado médico atrás de um link
encaminhável. Consequência aceita: **o paciente ainda vai esquecer a senha**; o botão de
gerar código novo é o que torna isso resolvível pela secretária, sem escalar.

**O e-mail é escolhido pelo paciente, não pela secretária.** Remove uma fonte de erro
inteira: quem digita é quem vai lembrar.

**Sem tabela nova.** No Run Coach o código *cria* o aluno, então vive numa tabela própria.
Aqui a conta já existe em `patient_users` (uma por paciente, `patient_id` único) — o código
mora na própria linha.

## Fluxo

### Secretária

No card do paciente, o botão passa a ser **"Gerar código de acesso"**. A tela mostra o
código, a validade (**30 dias**), e um botão **"Copiar mensagem"** com o texto pronto:

> Oi {nome}! Seu acesso ao portal: entre em {url}/portal e digite o código **{código}**

### Paciente

1. Abre o portal e clica em "Tenho um código"
2. Digita o código — minúsculo, com espaço, hífen ou ponto colado pelo teclado do celular
3. Escolhe **o próprio e-mail** e uma senha
4. Está dentro

### Esqueceu a senha

A secretária clica em **"Gerar novo código"** no card. O `password_hash` é zerado, sai um
código novo, o paciente refaz o passo a passo acima. Mesmo fluxo, nada novo para aprender.

## Modelo de dados

```sql
ALTER TABLE patient_users ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE patient_users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS patient_users_invite_code_idx
  ON patient_users (invite_code) WHERE invite_code IS NOT NULL;
```

`invite_expires_at` é preenchido com `NOW() + 30 dias` na geração.

`invite_token` (UUID) permanece na tabela, sem uso novo — ver Migração.

O código fica guardado em texto (não é hash): enquanto não for usado, a secretária pode
reabrir o card e ver o mesmo código de novo. Sem isso, "perdi a mensagem" viraria sempre um
código novo, e o paciente que já tinha anotado o antigo ficaria sem entender por que parou
de funcionar.

O índice único parcial é o que permite gerar com `ON CONFLICT DO NOTHING` e tentar de novo
em caso de colisão, em vez de tratar colisão como erro 500.

## Estados do código

| Estado | Condição | O que o paciente lê |
|---|---|---|
| Válido | existe, `invite_used_at IS NULL`, não expirou | segue para escolher e-mail e senha |
| Inválido | não existe, ou formato errado | "Código não encontrado. Confira as 6 letras e números." |
| Usado | `invite_used_at` preenchido | "Este código já foi usado. Entre com seu e-mail e senha." **+ botão para o login** |
| Expirado | `invite_expires_at <= NOW()` | "Este código expirou. Peça um novo na clínica." |

Distinguir "usado" de "inválido" é o ponto: é o caso mais frequente na prática (o paciente
ativa, esquece, tenta de novo) e hoje ele lê a mensagem errada.

## Segurança

**Força bruta.** Um código de 6 caracteres é uma credencial de entrada. Sem trava, um
atacante testa milhares por minuto. Usar a tabela `login_attempts` que já existe
(`src/lib/rate-limit.ts`), com um escopo novo, **travando por IP** — o identificador não
pode ser o código, senão cada tentativa cai num balde diferente e a trava nunca dispara.

**Ativação simultânea.** Dois cliques em "ativar" disparam duas requisições. A leitura do
código dentro da transação usa `SELECT ... FOR UPDATE` na linha de `patient_users`, para
que a segunda encontre o código já queimado.

**E-mail duplicado.** `patient_users.email` é único. O paciente precisa ler *"este e-mail
já está em uso"* — caso real: casal em que os dois são pacientes e compartilham e-mail.

**Auditoria.** Geração e uso do código entram em `audit_logs`, como o resto do sistema.

## Migração

**Nada quebra para quem já usa.** As 32 contas ativas continuam entrando com e-mail e senha;
nenhuma ação é exigida delas.

**Os 6 convites pendentes continuam válidos.** A rota `/portal/ativar/[token]` permanece
funcionando para quem já recebeu link. Só deixa de existir a *geração* de links novos.
Custa nada manter e evita contatar 6 pessoas para explicar que o link mudou. Remover a rota
e a coluna `invite_token` fica para depois, quando esses convites tiverem sido usados ou
expirados na prática.

## Módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/portal-invite-code.ts` | Sortear, normalizar e validar o código. **Lógica pura, sem banco** — é o que os testes cobrem. |
| `src/lib/patient-portal.ts` | Gerar o código para um paciente, ler o estado, ativar a conta. Estende o arquivo que já existe. |
| Rota de ativação | Recebe código + e-mail + senha; aplica rate-limit e devolve o estado. |
| Card do paciente | Botão de gerar código, exibição do código com validade, botão "Copiar mensagem". |
| Tela do portal | Campo "Tenho um código" e as três mensagens de erro distintas. |

## Testes

Jest, na lógica pura — que aqui é exatamente onde os erros aparecem. Sem harness de banco
nem de rota (o projeto não tem; `__tests__/lib/patients.test.ts` é um stub).

- o sorteio só produz caracteres do alfabeto permitido, sempre 6
- `k7p2-m9`, `K7P2 M9`, ` k7p2m9. ` normalizam todos para `K7P2M9`
- rejeita tamanho diferente de 6
- rejeita código com caractere ambíguo (`O`, `I`, `L`, `S`, `U`, `V`, `0`, `1`, `5`)
- a classificação de estado devolve inválido / usado / expirado corretamente, incluindo a
  fronteira de expiração

## Fora de escopo

- **Login sem senha.** Avaliado e recusado nesta rodada (ver Decisões).
- **Envio automático da mensagem.** A secretária continua colando no WhatsApp. Quando o
  projeto `whatsapp-instituto-torres` estiver de pé, o disparo pode ser automatizado — e aí
  vale reabrir a discussão de login sem senha, que passa a ser barato.
- **Trocar e-mail por telefone como identificador de login.** Mexeria no portal inteiro.
