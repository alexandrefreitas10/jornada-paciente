# Aba Fotos — antes e depois que fica guardado

**Data:** 19/10/2026

**Pedido do dono:** "Quero criar uma aba chamada fotos, onde toda vez que fizermos um antes e depois (dentro do card do paciente) essas fotos apareçam nessa aba, e também quero a mesma opção de fazer antes e depois que existe dentro dos cards nessa aba, pois às vezes quero fazer uma foto de pacientes que não têm card."

---

## 1. O que existe hoje (medido, não suposto)

O antes-e-depois é **efêmero**. Em três lugares do app o fluxo é o mesmo — escolher 2 fotos, enquadrar, e um botão que desenha a montagem num `<canvas>` e **baixa o PNG**. Nada é gravado: não existe tabela, registro nem arquivo no S3 da montagem.

| Lugar | Arquivo | Logo | Nome do arquivo baixado |
|---|---|---|---|
| Card › Fotos | `src/components/FilesTab.tsx` | `/logo-dra.png` | `comparacao-antes-depois.png` |
| Card › Estética | `src/components/EsteticaTab.tsx` | `/logo-it.png` | `comparacao-estetica.png` |
| Portal do paciente | `src/components/portal/screens/Fotos.tsx` | `/logo-dra.png` | `antes-depois.png` |

Acervo de fotos em produção (consulta só-leitura em 17/10/2026):

- **1.115 fotos** de **136 pacientes** — 1.080 do tipo `photo` e 35 do tipo `estetica`.
- Período: 17/06/2026 a 16/10/2026.
- A distribuição por paciente é quase toda múltiplo de 4 (44 pacientes com 4 fotos, 48 com 8, 25 com 12), ou seja ~4 fotos por sessão. O máximo é 24.

**Consequência de desenho:** listar foto por foto seriam 1.115 miniaturas. A unidade de listagem da aba é a **montagem**, não a foto. E como nada foi gravado até hoje, a galeria **nasce vazia** e só enche a partir do deploy.

`patient_files.patient_id` é `INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE`. Foto de quem não tem card não cabe nessa tabela sem torná-la anulável, o que mexeria em todas as outras abas do card. Por isso a aba ganha armazenamento próprio.

---

## 2. Decisões do dono

1. **O que a aba guarda:** a imagem montada, pronta (o mesmo PNG que ele baixa). Sem reedição de enquadramento depois de salvo — para mudar, faz outra montagem.
2. **Quem não tem card:** pasta por pessoa, com nome digitado, guardando fotos soltas — a foto de "antes" precisa sobreviver semanas até a de "depois" existir.
3. **Quem vê a aba:** a equipe inteira, igual aos cards de hoje. Sem permissão nova.
4. **O montador da aba serve pros dois casos:** paciente do sistema (usando as fotos que já estão no card dele) ou pessoa sem card.

---

## 3. A tela `/fotos`

Link **Fotos** no `NavMenu`, logo depois de *Implantes*, sem condição de permissão. Página server component que exige sessão de equipe (`auth()`, `redirect('/')` sem sessão), no padrão de `src/app/implantes/page.tsx`.

Três partes, de cima para baixo:

1. **Cabeçalho** — título, botão **"Novo antes e depois"** e campo de busca por nome que filtra a galeria e as pastas ao mesmo tempo.
2. **Galeria de montagens**, mais recente primeiro. Cada card mostra:
   - a **miniatura** da montagem (nunca o PNG inteiro);
   - o nome da pessoa como estava na hora da montagem;
   - as duas datas (antes e depois) e quem montou, com a data da montagem;
   - botão **baixar** (o PNG original) e botão **excluir**.
3. **Pessoas sem card** — lista das pastas: nome e quantas fotos tem. Abrir uma pasta mostra as fotos soltas em grade, com "enviar foto", e a seleção de 2 para montar.

Vazio: a galeria sem nenhuma montagem diz que a aba começa vazia porque antes do deploy as montagens só eram baixadas, e não guardadas — para o dono não procurar o que nunca existiu.

### O montador (quatro passos)

1. **De quem é?** — busca um paciente do sistema pelo nome **ou** digita o nome de alguém sem card (cria a pasta ou cai numa existente, ver §5).
2. **As duas fotos** — do paciente, as fotos dos tipos `photo` e `estetica` que já estão no card; da pessoa sem card, as fotos da pasta, com "enviar foto" ali mesmo. Exatamente 2, e a primeira escolhida é o "antes".
3. **Enquadrar** — o mesmo `CropEditor` de hoje, lado a lado.
4. **Resultado** — a prévia e o botão que baixa e salva.

A montagem feita pela aba usa a identidade **Fotos** (logo da dra.). A identidade Estética só sai de dentro do card de Estética, como hoje. (Escolher a identidade no montador é trabalho futuro, fora desta spec.)

---

## 4. Salvar: no mesmo clique que baixa

O botão que hoje só baixa passa a **baixar e salvar**, nos três lugares: card › Fotos, card › Estética e o montador da aba. O portal do paciente **não** entra: o paciente monta o dele no celular e continua só baixando.

**Não duplica.** Depois de salvar, a tela guarda o id do registro criado; clicar de novo no mesmo resultado baixa outra vez e não grava um segundo registro. Trocar o enquadramento (que volta para a tela de enquadrar) zera esse id — é outra montagem.

**Falha ao salvar não bloqueia o download.** O download acontece primeiro; se o POST falhar, a tela avisa que não foi guardado na aba Fotos e oferece tentar de novo. O dono fica com a imagem na mão de qualquer jeito, que é o que ele precisa no momento.

**Miniatura.** Junto do PNG vai um JPEG de no máximo 700px de largura (qualidade 0.8), gerado no mesmo passo do canvas. A montagem de duas fotos de celular passa de 4000px de altura e o PNG tem dezenas de MB; carregar 30 deles numa grade travaria o navegador. O que o dono baixa continua sendo o PNG inteiro, sem recompressão.

---

## 5. A regra do nome, para quem não tem card

Pasta é criada pelo nome digitado. Vale a regra que o dono já pediu nos implantes: **nome 100% idêntico = mesma pessoa**. A chave é o nome normalizado por `chaveNome` de `src/lib/implantes.ts` (sem acento, minúsculo, espaços colapsados), com `UNIQUE` no banco: digitar "ana paula" depois de "Ana Paula" cai na **mesma** pasta.

Nome parecido mas não idêntico ("Ana P.") é pasta diferente, de propósito. Adivinhar semelhança é exatamente o que duplicou um card de paciente numa renovação de implante, e foi daí que esta regra nasceu.

O nome exibido é o primeiro que foi digitado; a pasta não é renomeável nesta versão.

---

## 6. Onde fica guardado

`patient_files` **não é tocada**. Três tabelas novas, migrações idempotentes em `runMigrations()` de `src/lib/db.ts`, no padrão do arquivo.

```sql
CREATE TABLE IF NOT EXISTS foto_pessoas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  chave_nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS fotos_avulsas (
  id SERIAL PRIMARY KEY,
  pessoa_id INTEGER NOT NULL REFERENCES foto_pessoas(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS antes_depois (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  pessoa_id INTEGER REFERENCES foto_pessoas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  identidade TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  s3_key_thumb TEXT NOT NULL,
  data_antes TIMESTAMPTZ,
  data_depois TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT antes_depois_uma_origem CHECK ((patient_id IS NULL) <> (pessoa_id IS NULL))
);
CREATE INDEX IF NOT EXISTS antes_depois_created_at_idx ON antes_depois (created_at DESC);
```

Notas de projeto:

- `nome` é **cópia** do nome na hora da montagem, não um join. Se o card do paciente for arquivado, a montagem continua legível na galeria. Quem grava a cópia é o **servidor**: o POST manda `patient_id` (ou `pessoa_id`) e a rota busca o nome na hora de inserir. Assim o nome na galeria nunca depende de o componente ter recebido o nome como prop — `FilesTab` e `EsteticaTab` hoje recebem só o id.
- `data_antes` e `data_depois` são os `created_at` das duas fotos de origem, na ordem em que foram escolhidas (a primeira é o "antes"). São as mesmas datas impressas na imagem.
- O `CHECK` garante que a montagem é de um paciente **ou** de uma pasta, nunca dos dois nem de nenhum — origem ambígua é o tipo de dado que depois ninguém sabe consertar.
- `identidade` é `'fotos'` ou `'estetica'`: registra com qual layout o PNG foi gerado. Serve para a galeria rotular e para auditar, não para re-renderizar.
- Paciente é **soft-deleted** (`patients.deleted_at`), então o `ON DELETE CASCADE` na prática nunca dispara em arquivamento; ele só existe para o dia de uma exclusão de verdade, onde apagar tudo junto é o comportamento que o resto do sistema já promete.
- Chaves no S3: `antes-depois/<uuid>.png`, `antes-depois/<uuid>-thumb.jpg`, `sem-card/<pessoaId>/<uuid>.<ext>`.

---

## 7. Imagem é servida por rota-proxy, nunca por link assinado

URL assinada expira em 15 minutos (`getSignedDownloadUrl`, `expiresIn = 900`). Uma galeria fica aberta mais do que isso, e miniatura vencida vira imagem quebrada. Toda imagem da aba sai por rota de mesma origem que assina na hora, como `?proxy=1` já faz nos cards.

| Rota | Método | O que faz |
|---|---|---|
| `/api/fotos/montagens` | GET | lista as montagens não excluídas, mais recente primeiro |
| `/api/fotos/montagens` | POST | grava PNG + miniatura + metadados; devolve o registro |
| `/api/fotos/montagens/[id]` | DELETE | soft-delete (`deleted_at`) |
| `/api/fotos/montagens/[id]/imagem` | GET | serve o PNG (`?thumb=1` serve a miniatura) |
| `/api/fotos/pessoas` | GET | lista as pastas com a contagem de fotos |
| `/api/fotos/pessoas` | POST | acha-ou-cria a pasta pelo nome (§5) |
| `/api/fotos/pessoas/[id]/fotos` | GET | lista as fotos soltas da pasta |
| `/api/fotos/pessoas/[id]/fotos` | POST | envia uma foto solta |
| `/api/fotos/pessoas/[id]/fotos/[fid]` | DELETE | soft-delete da foto solta |
| `/api/fotos/pessoas/[id]/fotos/[fid]/imagem` | GET | serve a foto solta |

**Lista fechada de formatos, e o porquê.** O upload de foto solta aceita **somente** `image/jpeg`, `image/png` e `image/webp`, com a assinatura dos primeiros bytes conferida no servidor, e a extensão da chave do S3 é derivada do tipo validado — nunca do nome do arquivo que o cliente mandou. As rotas de imagem passam o tipo guardado pela mesma lista antes de devolvê-lo, e servem com `X-Content-Type-Options: nosniff` e `Content-Disposition: inline`.

Isto corrige um furo que a primeira versão desta spec tinha: `image/*` inclui `image/svg+xml`, SVG pode conter script, e imagem servida inline na origem do app faz esse script rodar com a sessão de quem abriu. Como só a equipe envia foto, o atacante precisaria de um login da clínica — mas o sistema tem vários logins e o alvo valioso é o do dono, então é escalada de um usuário para outro, não um cenário hipotético. A lista é definida num lugar só e usada pelo upload e pelas rotas de imagem: se as duas divergirem, a foto entra e depois não abre.

Toda rota exige sessão de equipe via `auth()` e devolve 401 sem ela. O `proxy.ts` global já manda sessão de portal para o login do portal em qualquer caminho fora de `/api/patients/<id>` e dos 4 POSTs liberados, então paciente não alcança `/api/fotos` — mas a checagem na rota é obrigatória de todo jeito: defesa em profundidade, não confiança no middleware.

---

## 8. A geometria das duas identidades, travada por teste

O cálculo do layout sai dos componentes para `src/lib/montagem.ts`, numa função **pura** que recebe as medidas das duas imagens, os dois recortes e a identidade, e devolve as coordenadas de tudo. O desenho no canvas fica fino, só executando o que a função decidiu.

Antes de mexer, um teste **fixa a geometria de hoje** das duas identidades, com os valores tirados do código atual. Se o refactor mudar um pixel, o teste quebra. É isso que garante que a imagem que o dono manda pro paciente continua idêntica.

Constantes de hoje, lidas do código:

| | Fotos (`FilesTab`) | Estética (`EsteticaTab`) |
|---|---|---|
| `GAP` | 20 | 16 |
| `LABEL_H` | 80 | 60 |
| `PADDING` | 40 | 24 |
| `LOGO_H` | 400 | 80 |
| `LOGO_GAP` | 16 | 12 |
| logo | `/logo-dra.png` | `/logo-it.png` |
| fonte do rótulo | `bold 48px sans-serif` | `bold 40px sans-serif` |
| cor do rótulo | `#374151` | `#374151` |
| `y` do rótulo | `contentTop + 56` | `contentTop + 44` |
| fonte da data | `bold 36px sans-serif` | `28px sans-serif` |
| cor da data | `#374151` | `#6b7280` |
| `y` da data | `contentTop + LABEL_H + maxH + 50` | `contentTop + LABEL_H + maxH + 40` |
| altura total | `LOGO_H + LOGO_GAP + LABEL_H + maxH + PADDING*2 + 24` | `PADDING + LOGO_H + LOGO_GAP + LABEL_H + maxH + 50 + PADDING` |

Comum às duas: fundo `#ffffff`; `contentTop = PADDING + LOGO_H + LOGO_GAP`; largura total `wA + wB + GAP + PADDING*2`; as duas fotos são escaladas para a **mesma altura** `maxH = max(altura efetiva A, altura efetiva B)`, mantendo proporção; recorte em coordenadas relativas (0–1) multiplicadas pelas dimensões naturais; rótulos `ANTES` e `DEPOIS` centralizados sobre cada foto; a data de cada foto centralizada abaixo dela.

**Diferença conhecida que NÃO vai ser mexida:** a data em Fotos sai com hora e minuto (`toLocaleString` pt-BR), e em Estética sai só `dd/mm/aaaa` fatiada da string ISO em UTC — o que exibe o dia seguinte para foto enviada à noite no horário de Brasília. É o mesmo defeito de `PatientCard.tsx:44`. Consertar mudaria a imagem que o dono manda hoje, então fica registrado aqui e vira conversa separada.

A montagem da aba nova usa a identidade **Fotos**, inclusive o formato de data com hora.

---

## 9. Exclusão

Soft-delete em tudo (`deleted_at`), como `patient_files` já faz: o arquivo continua no S3 e o registro deixa de aparecer. Excluir uma montagem **não** toca nas fotos de origem; excluir uma foto de origem **não** apaga a montagem — o PNG já é um arquivo próprio, e é justamente por isso que o dono escolheu guardar a imagem pronta.

Nesta versão não há tela de restauração para a aba Fotos (o `DeletedItemsTab` de hoje é por paciente). Excluir pede confirmação.

---

## 10. O que fica de fora, explicitamente

- **Nada retroativo.** As montagens já baixadas não existem no sistema. Importar os PNGs antigos é trabalho separado, só se o dono pedir.
- **Montador do portal** continua só baixando.
- **Sem reedição** de enquadramento de montagem salva (decisão 1 do dono).
- **Sem renomear pasta** e sem juntar pastas de nomes parecidos (§5).
- **Sem escolher identidade** no montador da aba.
- **Sem permissão nova:** a aba é da equipe inteira (decisão 3).

---

## 11. Testes

Unitários (projeto `lib`, puro, sem banco e sem navegador):

1. `montagem.ts` — a geometria das duas identidades, com números fixados do código atual: duas imagens de tamanhos diferentes, recorte cheio e recorte parcial, conferindo largura e altura totais, `contentTop`, posição e tamanho de cada foto, posição da logo e dos textos.
2. `montagem.ts` — fotos de alturas muito diferentes acabam com a **mesma** altura desenhada e cada uma mantém sua proporção.
3. A chave da pasta: nomes com acento, caixa e espaço duplo diferentes caem na mesma chave; "Ana P." e "Ana Paula" não.
4. A regra de origem única da montagem (paciente **ou** pasta) rejeita os dois e nenhum.

De componente (projeto `components`, jsdom): o resultado da montagem salva uma vez só — dois cliques no botão geram dois downloads e **um** POST.

As 4 suítes que já falhavam antes desta branch (`task-definitions`, `task-completions`, `patients`, `PatientCard`) continuam falhando e não são escopo daqui.
