# A tabela de acompanhamento no portal do paciente

**Data:** 21/10/2026

**Pedido do dono:** "Gostaria que essa tabela, que é sempre enviada na aba Evolução, aparecesse no portal do paciente, para o paciente poder visualizar essa foto da tabela e ir acompanhando pelo celular."

---

## 1. O que é, e o que já existe

Na aba **Evolução** do card, a clínica fotografa a tabela de papel do Instituto — a folha onde peso e circunferências são anotados semana a semana — e envia. São arquivos de `patient_files` com `file_type = 'evolution'`, exibidos ali como "Fotos de tabela enviadas".

O portal **não** carrega esses arquivos hoje. Mas a rota que ele já usa para foto (`/api/patients/[id]/files/[fid]/download`, com `?proxy=1` para exibir) serve qualquer arquivo do paciente, e o `proxy.ts` já libera esse caminho para a sessão do portal. **Não há rota nova nem permissão nova nesta entrega** — é lista e tela.

(Nota de passagem: `PortalData.measurements` existe e nenhuma tela do portal usa. O portal não mostra as medidas semanais em número nenhum hoje; a foto da tabela é a única forma de o paciente ver isso. Fica registrado, sem mexer.)

---

## 2. Decisão do dono

Bloco próprio **"Minha tabela"** no Acesso rápido da tela Início, **visível só para quem tem** foto de tabela — do mesmo jeito que o bloco de Estética já aparece só para quem faz estética. Abre uma tela própria.

As outras opções consideradas e descartadas: uma seção dentro da tela Fotos (misturaria a foto do corpo dele com a foto de um papel, e aquela tela acabou de ganhar o antes-e-depois) e dentro da Bioimpedância (o paciente teria de adivinhar que "tabela" mora ali).

---

## 3. O que o paciente vê

Tela **"Minha tabela"**, com subtítulo que diga o que é em uma linha (no espírito de "seu acompanhamento semana a semana").

- Todas as tabelas enviadas, **mais recente primeiro**, cada uma com a data do envio.
- A foto aparece inteira, não cortada: é um papel com números pequenos, e recorte quadrado esconderia justamente as últimas linhas preenchidas.
- Tocar amplia em tela cheia, para ele conseguir ler os números no celular.
- Da tela ampliada ele **baixa** a foto.
- Sem nenhuma tabela, a tela não é alcançável (o bloco não aparece na Início).

---

## 4. Como chega lá

`PortalData` ganha `tabelas: PortalFile[]`, carregado na página do portal com
`listPatientFiles(patientId, 'evolution')` e assinado pelo mesmo `withUrls` das
outras listas — mesmo padrão de `photos`, `exams` e `bioimpedances`, inclusive o
`onError` que cai para a rota-proxy quando a URL assinada vence (ela expira em
15 minutos e o portal fica aberto mais que isso).

`Screen` ganha `'tabela'`; `PortalApp` registra a tela; `Home` ganha o bloco
condicional.

---

## 5. O que não entra

- Nenhuma mudança na barra de navegação de baixo (os 5 lugares seguem como estão).
- O paciente **não** envia tabela: quem fotografa e envia é a clínica, pela aba Evolução, como hoje.
- Nada de transcrever os números da tabela para dentro do app — é a foto do papel.
- `PortalData.measurements` continua sem uso; fazer o portal mostrar as medidas em gráfico é outra conversa.

---

## 6. Testes

De componente (projeto `components`, jsdom):

1. A tela lista todas as tabelas, na ordem recebida (mais recente primeiro), e cada imagem aponta para o arquivo do **próprio** paciente.
2. A data de cada uma aparece.
3. O bloco "Minha tabela" aparece na Início **só** quando há tabela.

As 4 suítes que já falhavam antes desta branch continuam falhando e não são escopo.
