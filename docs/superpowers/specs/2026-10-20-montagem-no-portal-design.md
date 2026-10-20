# A montagem antes-e-depois no portal do paciente

**Data:** 20/10/2026

**Pedido do dono:** "Quero que essa montagem também apareça no portal de cada paciente, toda vez que ela for feita."

---

## 1. O que já existe

A aba Fotos (no ar 19/10) guarda cada montagem antes-e-depois na tabela `antes_depois`, com `patient_id`, as duas datas e as chaves do S3 da imagem e da miniatura. Hoje ela só é visível para a equipe: a rota `/api/fotos/montagens/[id]/imagem` exige sessão de equipe via `auth()`, e sessão de portal nem chega lá — o `src/proxy.ts` manda paciente para o login fora de `/api/patients/<id dele>`.

O portal monta os dados **no servidor**: `src/app/portal/paciente/page.tsx` carrega tudo e entrega um `PortalData` pronto para `PortalApp`. A tela de fotos (`src/components/portal/screens/Fotos.tsx`) já exibe as fotos do paciente e já deixa ele montar o próprio antes-e-depois no celular — aquela montagem é só baixada, nunca guardada, e **continua assim**.

---

## 2. Decisões do dono

1. **Toda montagem aparece, automaticamente.** Sem botão de esconder, sem marcar uma a uma.
2. **Retroativo:** as 15 montagens já gravadas aparecem assim que isto subir.
3. O paciente **pode salvar** a imagem no celular.
4. Entram as **duas identidades** visuais (Fotos e Estética).

---

## 3. O que o paciente vê

Na tela **Fotos** do portal, uma seção no topo, antes das fotos soltas:

- Título "Seu antes e depois".
- As montagens do paciente, **mais recente primeiro**, em miniatura.
- Sob cada uma, as **duas datas** (a do antes e a do depois), no formato `dd/mm/aaaa`, em Brasília.
- Tocar abre a imagem inteira; dali ele salva no celular.

**Não aparece** no portal: quem montou, quando foi montada, nem qual identidade visual foi usada. É informação interna da clínica e não acrescenta nada para o paciente.

Sem montagem nenhuma, a seção simplesmente não é renderizada — nada de espaço vazio com texto explicando o que ele não tem.

Nenhum item novo no menu do portal: para a maioria dos pacientes a seção estaria vazia, e quem tem montagem procura na tela de fotos de qualquer jeito.

---

## 4. Como os dados chegam lá

**A lista** entra no `PortalData`, montada no servidor junto com o resto, sem ida extra à rede:

```ts
export interface PortalMontagem {
  id: number
  dataAntes: string | null
  dataDepois: string | null
}
```

Só isso. O portal **não** recebe chave do S3, nome gravado, autor nem identidade — o que não é mostrado não viaja.

**A imagem** vem de uma rota nova, no caminho que o paciente já tem permissão de ler:

| Rota | O que faz |
|---|---|
| `GET /api/patients/[id]/montagens/[mid]/imagem?thumb=1` | miniatura, em stream |
| `GET /api/patients/[id]/montagens/[mid]/imagem?proxy=1` | imagem inteira, em stream, para exibir |
| `GET /api/patients/[id]/montagens/[mid]/imagem` | download, com nome de arquivo legível |

O vocabulário (`?thumb=1`, `?proxy=1`, padrão = download) é o mesmo de `/api/patients/[id]/files/[fid]/download`, que a tela de fotos do portal já usa. Stream da própria origem, nunca URL assinada embutida: a assinatura expira em 15 minutos e o portal fica aberto mais que isso.

---

## 5. Quem pode ver

Três camadas, nesta ordem:

1. **O `proxy.ts`** já restringe sessão de portal a `GET /api/patients/<id do próprio paciente>`. Um paciente não alcança o caminho de outro.
2. **A rota confere a sessão ela mesma** — equipe via `auth()` **ou** portal via `portalAuth()` com `patient_id` igual ao `[id]` do caminho. A rota irmã de arquivos não faz isso e confia só no middleware; aqui faz, porque confiar no middleware é confiar em uma linha de configuração de rota que ninguém relê.
3. **A montagem tem de pertencer ao paciente do caminho** (`montagem.patient_id === id`), senão 404 — o mesmo anti-IDOR da rota de arquivos. Sem isso, trocar o `[mid]` na URL mostraria a montagem de outro paciente.

Montagem de **pessoa sem card** (`pessoa_id` preenchido, `patient_id` nulo) nunca casa com um `[id]` de paciente, então é inalcançável por construção.

---

## 6. Exclusão

A montagem soft-deletada some do portal junto, sem nada a mais: a consulta da lista e a busca da rota já filtram `deleted_at IS NULL`. Se o dono exclui na aba dele, o paciente deixa de ver — que é o comportamento que ele espera de "excluir".

---

## 7. O que não entra

- **Nenhum controle de "mostrar/esconder"** por montagem (decisão 1 do dono). Se ele mudar de ideia, é coluna nova e um botão — não está desenhado aqui.
- **O paciente continua sem poder guardar** a montagem que ele mesmo faz no portal; aquela é baixada e esquecida, como hoje.
- **Nenhuma notificação** avisando o paciente de que apareceu montagem nova.
- **Nada de nome, autor ou identidade** no portal (§3).

---

## 8. Testes

Puros (projeto `lib`):

1. A regra de quem pode ver uma montagem: pertence ao paciente do caminho → pode; de outro paciente → não; de pasta sem card → não; soft-deletada → não.

De componente (projeto `components`, jsdom), sobre a tela de fotos do portal:

2. Com montagens, a seção aparece, na ordem mais-recente-primeiro, e cada imagem aponta para a rota com `?thumb=1` do **próprio** paciente.
3. Sem montagem, a seção não é renderizada.
4. As duas datas de cada montagem aparecem formatadas, e uma data ausente não quebra a tela.

As 4 suítes que já falhavam antes desta branch (`task-definitions`, `task-completions`, `patients`, `PatientCard`) continuam falhando e não são escopo. `RelatoriosTab` e `ConciliacaoClient` falham de forma intermitente sob carga e passam isoladas.
