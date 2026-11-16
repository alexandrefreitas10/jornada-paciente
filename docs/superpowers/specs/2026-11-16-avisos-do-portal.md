# Avisos do portal — quais eventos disparam e o que cada um diz

**Data:** 16/11/2026. **Aprovado pelo dono** na mesma conversa ("pode fazer os 3").

Contexto: o encanamento de aviso no celular ficou pronto em 11/11/2026 e foi
testado num iPhone de verdade, mas **nada disparava sozinho** — faltava
decidir o quê e com que texto. Em 16/11 o convite para ligar os avisos passou
a aparecer logo depois de o paciente marcar a aplicação, e ele promete
*"a gente te lembra quando o dia estiver chegando"*. Esta spec é o que torna
essa promessa verdadeira.

## O princípio

**Cada aviso gasta um pouco da paciência da pessoa, e o estoque é pequeno.**
Quem se irrita desliga — e desligar é quase definitivo, porque voltar exige
achar a permissão nos Ajustes do aparelho.

Daí a régua: **se um aviso não substitui uma mensagem que alguém da clínica
teria que mandar no WhatsApp, ele não deveria existir.**

## Os três avisos

### 1. A agenda liberou

**Dispara:** quando a equipe sobe uma folha na aba **Prescrições** de um
paciente que ainda não tinha nenhuma.

> **Sua agenda está liberada**
> Escolha o horário da sua próxima aplicação.

**Por que é o de maior valor hoje:** em 16/11 são 192 pacientes sem folha, e
cada um vai receber a sua nas próximas semanas. Hoje a aba Agenda aparece no
celular da pessoa **em silêncio**, e alguém da recepção avisa uma a uma — é
exatamente o trabalho manual que o dono relatou. É também o único dos três que
chega num momento em que a pessoa **pode agir**: ela abre e marca.

**Só na primeira folha.** Paciente em tratamento longo recebe folha nova a
cada ciclo; avisar "sua agenda está liberada" de novo, para quem já está
usando a agenda há semanas, é ruído.

### 2. Lembrete da véspera

**Dispara:** na manhã do dia anterior, para quem tem aplicação marcada e viva.

> **Sua aplicação é amanhã**
> Quinta-feira, às 15h.

**Por que:** é a promessa que o convite faz. É também o que reduz falta sem
avisar, que hoje a clínica só descobre na hora.

### 3. A clínica marcou ou mudou seu horário

**Dispara:** quando a EQUIPE marca ou remarca pelo paciente.

> **Seu horário foi marcado** / **Seu horário mudou**
> Sexta, 21/11, às 14h.

**Não dispara quando o próprio paciente marca** — ele acabou de ver a tela
confirmar; avisar seria eco.

**EXCEÇÃO QUE FICA COMO ESTÁ:** quando a clínica **bloqueia um dia** e o
sistema derruba os agendamentos, o aviso continua **humano**. Decisão do dono,
de 12/11, e ela se sustenta: receber "sua aplicação foi cancelada" de um robô,
sem ninguém a quem perguntar o que houve, é pior que o WhatsApp da clínica. O
bloqueio já devolve a lista de quem avisar, justamente para isso.

## Regras que valem para todo texto

**Nunca o nome da medicação, nem nada clínico.** O aviso aparece na tela
bloqueada, onde marido, filho e colega leem sem querer. "Sua aplicação" basta
— é a palavra que a clínica já usa. Isto não é preciosismo: é a diferença
entre um lembrete e uma indiscrição.

**Nunca o nome do paciente.** Pelo mesmo motivo, e porque é redundante: o
celular é dele.

**Nada antes das 8h nem depois das 20h** (horário de Brasília).

**Um aviso por acontecimento, nunca repetido.**

## O que fica de fora, e por quê

- **Arquivo novo na ficha** (foto, exame, evolução): é dado de saúde chegando
  sem a pessoa ter pedido.
- **Divulgação de qualquer tipo:** o jeito mais rápido de alguém desligar os
  avisos para sempre.
- **Cobrar quem sumiu:** isso é a aba *Em tratamento*, que tem o julgamento de
  uma pessoa no meio e deve continuar tendo.

## Tamanho de cada peça

- **1 e 3** são baratos: disparam de dentro de código que já existe (a gravação
  do arquivo e a gravação do agendamento).
- **2** é o único que precisa de peça nova: algo que rode uma vez por dia e
  varra quem tem aplicação amanhã.

## O que isto NÃO faz

- Não manda nada por WhatsApp. O aviso é o do celular, pelo portal.
- Não avisa quem não ligou os avisos — e ninguém consegue ligar pelo paciente.
- Não substitui o contato humano no bloqueio de um dia.
