# Agenda de injetáveis — design

**Data:** 12/11/2026
**Estado:** aguardando aprovação do dono — todas as perguntas em aberto foram respondidas

---

## Por que isso existe

Hoje o paciente que precisa marcar a aplicação dos injetáveis pergunta o horário no grupo de WhatsApp, e alguém da equipe responde e anota. Toda marcação passa por uma pessoa.

A medida de sucesso foi dada pelo dono, e é ela que decide as dúvidas de detalhe deste documento:

> **"Quando o paciente marcar sozinho e parar de perguntar horário no grupo."**

Isso tem uma consequência prática: a tela do paciente precisa ser clara a ponto de não gerar dúvida. Uma agenda que funcione mas que deixe o paciente inseguro — sobre qual aplicação escolher, sobre se o horário é dele mesmo, sobre o que fazer quando não pode ir — falha neste critério mesmo passando em todos os testes.

## Como funciona a sala hoje

O paciente chega, é recebido pela recepcionista com um cardápio, faz um lanche e vai para o enfermeiro. Ele tem uma prescrição da médica de 8 a 12 semanas, com uma medicação por semana, e é atendido na sala de injetáveis.

A sala tem **um enfermeiro e quatro cadeiras**. O enfermeiro é o gargalo apenas no **começo** de cada atendimento: prepara a medicação, aplica e tira medidas, cerca de 10 minutos. Depois disso, quem está na soroterapia fica sentado sozinho com o soro correndo, e o enfermeiro já começa o próximo paciente.

Duas durações:

| Aplicação | Enfermeiro | Cadeira |
|---|---|---|
| Intramuscular ou tirzepatida | ~10 min | — |
| Soroterapia | ~10 min (montagem) | 40 min |

---

## A regra de capacidade

**Um agendamento por fatia de 10 minutos.** Essa é a única trava. Nunca duas pessoas marcadas às 15h10: uma fica 15h10 e a outra 15h ou 15h20.

As quatro cadeiras **não precisam de uma segunda regra**, e isso não é descuido — é aritmética. Uma soroterapia dura 40 minutos, que são exatamente quatro fatias de 10. Começando no máximo uma a cada 10 minutos, o pior caso possível é quatro pessoas no soro ao mesmo tempo. Exatamente o número de cadeiras. Nunca cinco.

> **Atenção de quem for manter isso:** a coincidência é exata e frágil. Ela deixa de valer se uma soroterapia passar de 40 minutos ou se o número de cadeiras mudar. O dono confirmou que soro **nunca** passa de 40 min. Se um dia passar, a regra única não basta mais e será preciso controlar cadeiras separadamente. Deixe isso escrito perto do código que calcula disponibilidade.

## Horário de funcionamento

Padrão semanal fixo, igual toda semana:

| Dia | Horário | Fatias de 10 min |
|---|---|---|
| Segunda | 14h–20h | 36 |
| Terça | 14h–20h | 36 |
| Quarta | 15h–18h | 18 |
| Quinta | 13h–20h | 42 |
| Sexta | 12h–19h | 42 |
| Sábado, domingo | fechado | — |

**174 fatias por semana.**

**Feriados nacionais:** fechados, marcados automaticamente pelo sistema. Feriado é esquecível, e esquecer significa paciente marcando num dia em que a clínica está fechada.

**Só os nacionais entram no código.** Decisão do dono: *"o resto a gente bloqueia na mão"*. Feriado municipal de Goiânia, estadual e ponto facultativo ficam por conta do "bloquear agenda", porque a clínica nem sempre fecha neles e a lista mudaria de ano para ano.

Os nacionais devem ser **calculados**, não digitados numa lista fixa. Os móveis — Carnaval, Sexta-feira Santa, Corpus Christi — dependem da Páscoa e mudam todo ano; uma lista fixa funciona até dezembro e falha caladamente em janeiro, quando ninguém lembra de renovar. Como o paciente só enxerga quatro semanas à frente, a falha apareceria tarde e como "paciente marcou em feriado". *(Escolha de quem escreveu este documento.)*

**Os últimos 30 minutos de cada dia só aceitam aplicações de 10 minutos.** Uma soroterapia que comece ali terminaria depois do fechamento — na segunda, começar 19h40 significa sair 20h20. Decisão do dono: o portal simplesmente não oferece soroterapia nessas três fatias. Sobram 159 fatias por semana capazes de receber soroterapia.

---

## Quem vê a agenda

A aba Agenda **só existe no portal do paciente que tem pelo menos um arquivo na aba Prescrições** (`file_type = 'prescricao'`). Quem não tem, não vê a aba — não vê vazia, não vê bloqueada: ela não existe.

Qualquer arquivo serve. O sistema **não lê o conteúdo** do PDF e não distingue prescrição de uso oral de prescrição de injetável. Isso foi levantado com o dono — o documento de exemplo que ele enviou era de uso oral, sem nenhum injetável — e ele confirmou a regra assim mesmo: *"quando tiver arquivo assim libera a agenda"*. Quem de fato faz injetável é combinado no grupo de WhatsApp.

Isso convive com a aba Estética: a cliente que só faz depilação a laser não tem folha em Prescrições, logo não vê Agenda.

---

## O lado do paciente

### O que ele pode

- **Um agendamento futuro por vez.** Marca a próxima aplicação, cumpre, e só então libera marcar a seguinte. Com uma marcada, não existe botão para marcar outra — só trocar ou desmarcar.

  **O que libera a próxima é o RELÓGIO, não o status.** Passou a hora do agendamento, ele pode marcar outro — mesmo que ninguém tenha clicado em "atendido" ainda.

  Isso é decisão do dono e tem motivo forte: se dependesse de alguém marcar "atendido", todo agendamento que a equipe esquecesse de fechar deixaria o paciente **travado sem entender por quê** — e ele voltaria a pedir horário no grupo, que é exatamente o fracasso declarado deste projeto. O preço aceito é que ele pode marcar a próxima ainda sentado na cadeira tomando soro, o que é inofensivo (e até conveniente: ele está ali, com tempo e com o celular na mão).

- **Quem faltou marca sozinho também.** "Faltou sem avisar" não bloqueia nada; é registro, não punição.
- **Enxerga quatro semanas à frente** (escolha do redator deste documento, não do dono — ver "Escolhas minhas"). Dias fechados, feriados e dias bloqueados não aparecem.
- **Escolhe a DURAÇÃO primeiro, depois o dia, depois o horário.** A ordem importa: é a duração que define quais horários sobram, já que nos últimos 30 minutos do dia os 40 minutos não são oferecidos. Escolher o horário antes faria o sistema recusar depois, que é a pior experiência possível.

  **A escolha é de TEMPO, não de procedimento**, e isso é decisão do dono com um motivo concreto: *"alguns pacientes têm aplicação e soro, mas isso tudo em 40min dá certo"*. Quem faz as duas coisas no mesmo dia não precisa decidir qual é a dele. As duas opções, nestas palavras:

  | Botão | Texto de apoio |
  |---|---|
  | **10 minutos** | Só a aplicação |
  | **40 minutos** | Soroterapia — com ou sem aplicação junto |

  O número vem primeiro **de propósito**. A clínica combina a duração no grupo de WhatsApp, então o paciente chega sabendo "é 40 minutos" e toca em 40 minutos, sem traduzir nada. Se os botões dissessem "Aplicação" e "Soroterapia", quem faz as duas pararia para pensar qual é a sua — e parar para pensar é o primeiro passo para abrir o WhatsApp e perguntar, que é o que este projeto existe para evitar.

  Abaixo das opções, uma linha: *"Na dúvida, é o que foi combinado no grupo."*
- **Troca ou desmarca sozinho até 1 hora antes.**

### O que ele não pode

- **Nunca** marcar numa fatia que já tem alguém. Encaixar em horário ocupado é privilégio exclusivo da equipe.
- Mexer no agendamento com menos de 1 hora de antecedência. Nesse caso a tela trava e mostra o recado, com este texto:

  > *"Para remarcar com menos de 1h de antecedência, favor avisar no grupo de suporte pelo WhatsApp."*

### A tela

Três estados, nesta ordem de importância:

1. **Sem agendamento:** diz que não há aplicação marcada e oferece marcar.
2. **Escolhendo:** tipo → dia → horário, com os horários ocupados visíveis porém riscados.
3. **Já marcado:** o dia, a hora e a duração em destaque, com "trocar horário" e "desmarcar", e a explicação de que se marca uma por vez.

O visual segue o design system do portal, que já existe e é mobile-first.

---

## O lado da equipe

Qualquer funcionário, não só o enfermeiro.

### Ver

- **Visão do dia e visão da semana**, alternáveis. O dia é o que o enfermeiro abre ao começar o turno; a semana serve para se situar.
- Dias, horários e quem está agendado em cada fatia.
- **O nome do paciente é clicável e abre o card dele.** Pedido explícito do dono.

### Fazer

- **Encaixar manualmente**, inclusive **em fatia que já está ocupada**. É para quem apareceu sem marcar. O sistema não impede — a regra de uma pessoa por fatia vale para o paciente, não para a equipe.
- **Bloquear a agenda**, dia inteiro ou pedaço de dia, para quando a sala fechar.

  Quando o bloqueio atingir fatias que já têm gente marcada, **a tela lista quem estava agendado** e **os agendamentos caem automaticamente**, marcados como desmarcados pela clínica. Cada paciente volta a ter zero agendamentos e pode marcar outro horário sozinho.

  Derrubar é o certo pela regra que o próprio dono deu: se ficassem de pé, o paciente abriria o portal e veria "sua aplicação, quarta 15h" num dia em que a clínica está fechada — que é literalmente o modo de falha declarado "o paciente conseguir marcar um horário que não pode ser atendido", só pelo outro lado.

  O sistema **não avisa ninguém automaticamente**: quem avisa é a equipe, pelo grupo. A lista existe para a pessoa saber exatamente quem procurar. (Situação rara — só urgência ou saúde.)
- **Trocar a duração de um agendamento já feito.** O paciente escolhe o tipo sozinho, baseado no que foi combinado no grupo, e pode errar. Sem isso, o erro só apareceria com ele já sentado na cadeira.

### Permissão

**Qualquer funcionário logado**, sem permissão nova. O dono foi literal: *"o Carlos ou qualquer outro funcionário tem a opção de encaixar"*. Não criar `can_agenda` ao lado de `is_admin` / `can_estoque` / `can_conciliacao`.

O clique no nome abre o card completo do paciente — mas isso **não expõe nada novo**: qualquer funcionário já alcança esse card hoje por `/pacientes`. A agenda é só um atalho.

Bloquear e trocar duração seguem a mesma régua: qualquer funcionário. *(Escolha de quem escreveu este documento — o dono falou "a equipe" o tempo todo, sem separar papéis.)*

### Marcar pela equipe, não só encaixar

O dono disse que pela tela da equipe dá para *"mexer nela por completo"*. Portanto a equipe pode:

- marcar para **qualquer dia futuro**, não só encaixar em cima da hora (a recepcionista marca para quem pediu no grupo, não tem celular ou não ativou o portal);
- marcar para paciente **sem arquivo em Prescrições** — aquela trava é do portal, não da clínica;
- marcar para quem **já tem** agendamento futuro — o limite de um por vez é do paciente.

O paciente precisa **existir no cadastro**: o nome na agenda abre o card dele, então não há agendamento com nome solto. *(Escolha de quem escreveu este documento.)*

### Quando a equipe fura a regra, o sistema avisa — e deixa passar

Encaixar em fatia ocupada pode gerar a quinta pessoa no soro; trocar uma aplicação de 10 para 40 minutos nos últimos 30 minutos do dia joga o atendimento para depois do fechamento.

Nos dois casos o sistema **avisa e obedece**: *"isso deixa 5 pessoas no soro às 15h20"*, *"termina 20h20, depois do fechamento"*. Nunca impede — a permissão de furar é deliberada. Mas furar sem perceber é diferente de furar sabendo. *(Escolha de quem escreveu este documento.)*

### Status

Quatro, e o enfermeiro move entre eles:

| Status | Significado |
|---|---|
| **agendado** | estado inicial |
| **atendido** | aplicou |
| **faltou sem avisar** | não veio |
| **remarcou** | mudou de dia — mantido só para controle da clínica |
| **desmarcou** | cancelado sem remarcar, guardando **quem** cancelou |

**A agenda mostra o agora; o relatório guarda a história.** Esta é a regra que organiza tudo, e veio do dono assim: *"na agenda eu quero ver só o atualizado, no relatório eu preciso saber quem foi desmarcado ou faltou, atendido, tudo"*.

Na prática:

- Trocar de horário **grava as duas linhas** — a antiga como "remarcou", a nova como "agendado" —, mas a grade do dia mostra só a nova. Nada de `UPDATE` que apaga o passado: o dono disse que "remarcou" existe "somente para nosso controle", e um registro que some não controla nada.
- Desmarcar tira da grade e **mantém a linha** no relatório.
- **"desmarcou" é um quinto estado**, que não estava nos quatro originais. Ele apareceu quando o dono separou agenda de relatório: sem ele, cancelamento sumiria sem rastro, contrariando o que ele pediu.
- A linha guarda **quem** cancelou, paciente ou equipe. É a diferença entre um paciente que desmarca toda semana e a clínica reorganizando o dia — e o sistema já registra autoria em todo lugar, então não custa nada. *(Escolha de quem escreveu este documento.)*

**Quem marca "atendido" é a pessoa, não o relógio.** Se o sistema marcasse sozinho ao passar do horário, quem faltou viraria "atendido" — o status perderia o sentido exatamente onde mais importa.

### A ponte com o estoque

Quando um agendamento vira **atendido**, aparece o atalho para **registrar a saída dos ativos daquele paciente**, levando à tela de saída de estoque já com o paciente escolhido.

Este é o **único** ponto em que a agenda encosta no módulo de estoque. Não há baixa automática: quem registra o que saiu é a pessoa.

---

## Relatórios › Agendamentos (sub-aba nova)

Serve para gerenciar, não só olhar:

- Todos os agendamentos **do mês**
- Filtro por **período** e por **status**
- **Histórico de agendamentos de um paciente**

**Aqui aparece tudo o que a agenda esconde.** Enquanto a grade do dia mostra só o estado atual, este relatório é onde o dono vê quem desmarcou, quem faltou, quem foi atendido e quem remarcou — palavras dele: *"no relatório eu preciso saber quem foi desmarcado ou faltou, atendido, tudo"*. É o que torna o histórico útil em vez de só armazenado.

Segue o padrão das outras sub-abas de Relatórios, que já existem.

---

## O que este módulo NÃO faz

- **Não envia notificação nenhuma.** O módulo de aviso (push) ficou pronto em 11/11/2026, mas quais eventos disparam e com que texto ainda será definido pelo dono. A agenda cria a possibilidade de lembrete de consulta, que até então não existia no sistema — mas isso é trabalho separado e depende daquela definição.
- **Não sabe qual medicação será aplicada.** Isso é combinado no grupo de WhatsApp. O agendamento guarda o tipo (10 ou 40 minutos) e nada mais sobre o conteúdo.
- **Não lê o PDF da prescrição.**
- **Não dá baixa automática no estoque.**
- **Não agenda consulta médica, estética ou qualquer outra coisa** — só aplicação de injetáveis.

## O que faria isso fracassar mesmo funcionando

- O paciente continuar perguntando horário no grupo.
- O paciente conseguir marcar um horário que não pode ser atendido.
- A equipe perder a capacidade de encaixar alguém em cima da hora.
- Um registro de "remarcou" desaparecer.

---

## Escolhas minhas, não do dono

Estão aqui separadas para ele poder discordar de cada uma:

1. **Janela de quatro semanas** para o paciente enxergar e marcar. Como ele só pode ter um agendamento por vez, a janela não controla acúmulo — serve só para a grade não virar um calendário infinito.
2. **Horário ocupado aparece riscado**, não sumido. Ver que está cheio explica por que a escolha é curta; sumir fica mais limpo mas parece que o dia tem poucos horários.
3. **A tela de bloqueio lista quem estava marcado.**
4. **"Atendido" é marcado por uma pessoa**, não pelo relógio. Se o sistema marcasse sozinho ao passar da hora, quem faltou viraria "atendido" e o status perderia o sentido justamente onde importa. Isso não trava ninguém: o que libera o paciente a marcar de novo é o relógio, decidido pelo dono.
5. **A equipe pode trocar a duração** de um agendamento feito pelo paciente.
10. **A linha de "desmarcou" guarda quem cancelou**, paciente ou equipe.
6. **Nenhuma permissão nova.** Qualquer funcionário logado usa a agenda inteira, bloqueio incluído.
7. **O sistema avisa quando a equipe fura a regra**, mas nunca impede.
8. **Feriados calculados**, não lista fixa.
9. **Agendamento só para paciente cadastrado**, sem nome solto.

## O que fica a cargo de quem construir

- Modelagem de tabelas e colunas.
- Onde exatamente a Agenda entra na navegação do portal (que tem barra inferior com ícones) e no menu da equipe.
- Se o paciente enxerga os agendamentos passados dele, e como.
- Como a visão de semana se organiza visualmente.
- Formato do bloqueio no banco (dia inteiro e pedaço de dia são a mesma coisa com horários diferentes, ou coisas distintas).

## Restrições técnicas do projeto

- **Next.js 16** — a API mudou em relação ao que se conhece. `params` de rota é Promise; `middleware.ts` virou `proxy.ts`. Ler `node_modules/next/dist/docs/` antes de escrever.
- **Não rodar `npm run build` nem `next dev` no checkout principal.** Verificação é `npx tsc --noEmit` e `npx jest`. Para validar empacotamento sem tocar produção, existe receita com worktree isolado (ver memória do projeto) — vale a pena se este módulo trouxer dependência nova.
- **Nunca usar dado real de paciente** em teste, fixture ou commit. Nomes inventados.
- **Comentário e mensagem de commit em português**, explicando o **porquê**, não o quê.
- O guardião de rotas é `src/proxy.ts`. O portal do paciente só alcança `/portal/paciente` e rotas específicas de `/api/patients/{id}`; rota nova para o portal precisa ser pensada contra esse guardião.
- Datas: coluna `date` é dia puro e **não** pode ser convertida por fuso; `timestamptz` é instante e deve ser mostrado em America/Sao_Paulo. As funções estão em `src/lib/datas.ts`.
