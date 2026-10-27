# Lista de procedimentos estéticos

**Data:** 27/10/2026

**Pedido do dono:** "Pode colocar a opção de escolher da lista para não precisar ficar unificando e também opção de colocar alguma nova, quando surgir, para não precisar voltar aqui."

---

## 1. O problema que isto resolve

`aesthetic_sessions.procedure_name` é digitado à mão. Resultado medido: **15 grafias para 9 procedimentos** (`T-SCULPTOR`, `T-sculptor`, `T- SCULPTOR`, `T-SCULPTOR `). O relatório por procedimento agrupa pela grafia normalizada, mas **palavras diferentes** (`Protocolo Blindagem` × `Blindagem Capilar`) só se juntam por uma declaração no código — ou seja, o dono precisa pedir, e alguém precisa publicar.

Enquanto o nome for digitado, isso se repete para sempre.

---

## 2. Como fica

O campo "Nome do procedimento" deixa de ser texto livre e passa a ser **escolhido de uma lista**, com um **"+ novo procedimento"** ao lado para quando aparecer um de verdade. A Fran cadastra na hora e ele já vale para todo mundo — sem passar por um desenvolvedor.

**O que impede o problema de voltar:** ao cadastrar um nome novo, ele é comparado com os existentes pela **mesma chave** do relatório (`chaveProcedimento`, que ignora acento, caixa e pontuação). Se ela digitar `T sculptor`, o sistema devolve o `T-SCULPTOR` que já existe e usa esse. Grafia nova para procedimento que já existe deixa de ser possível pelo caminho normal.

Palavras genuinamente diferentes continuam criando procedimento novo — é o que deve acontecer, e é a própria Fran decidindo.

---

## 3. O que NÃO muda

- **`aesthetic_sessions` não ganha coluna nenhuma.** O procedimento continua gravado como texto; a diferença é que agora vem sempre com a grafia da lista. Isso mantém de pé o relatório, as junções declaradas e os 33 registros antigos, sem migração de dado.
- **Os registros antigos ficam como estão.** As duas junções declaradas (`Protocolo Blindagem` → `Blindagem Capilar`, `Criolipolise` → `Criolipólise de Placas`) continuam valendo para eles.
- **Nenhuma tela de gerenciar a lista** (renomear, apagar, arquivar). Acrescentar resolve o pedido; gerenciar é outra conversa e o dono sabe disso.

---

## 4. A lista inicial

Nasce com os 7 procedimentos que já existem, **com a grafia exata em que foram digitados** — decisão do dono:

`Blindagem Capilar` · `Criolipólise de Placas` · `Criolipolise Dinâmica` · `DEPILAÇÃO A LASER` · `Fortalize` · `Radiofrequência` · `T-SCULPTOR`

Ele foi avisado de que `DEPILAÇÃO A LASER` está em caixa alta e `Criolipolise Dinâmica` sem acento, e preferiu manter.

A semente é **idempotente** e roda na primeira leitura da lista, não na migração: assim a chave de cada nome é calculada pela mesma função do resto do sistema (`chaveProcedimento`), em vez de ser escrita à mão no SQL e divergir no dia em que a regra mudar.

---

## 5. Onde fica

```sql
CREATE TABLE IF NOT EXISTS procedimentos_esteticos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  chave TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);
```

`chave` é `UNIQUE` para que a garantia de "não duplica" valha **no banco**, e não só na tela: duas pessoas cadastrando o mesmo procedimento ao mesmo tempo não podem criar dois.

| Arquivo | Papel |
|---|---|
| `src/lib/procedimentos-esteticos-db.ts` | listar, achar-ou-criar, semente |
| `src/app/api/procedimentos-esteticos/route.ts` | GET lista, POST acha-ou-cria |
| `src/components/EsteticaTab.tsx` | o campo vira seleção + "novo" |

---

## 6. Testes

1. A lista inicial produz **7 chaves distintas** (se duas colidirem, duas opções do menu viram a mesma coisa).
2. Cadastrar `T sculptor` quando já existe `T-SCULPTOR` devolve o existente, não cria outro.
3. Nome vazio ou só pontuação é recusado.
