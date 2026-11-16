// Os status de um agendamento. MÓDULO PURO: nenhum import, de propósito.
//
// POR QUE EXISTE SEPARADO DE `agenda-db.ts`: estas constantes são usadas pela
// tela (`src/app/relatorios/Agendamentos.tsx`, que é `'use client'`). Importar
// um valor de `agenda-db` arrasta `@/lib/db` junto, e `db.ts` chama
// `postgres(...)` no topo do módulo — ou seja, o driver do Postgres, com os
// imports de `fs` e `net` que ele tem, entraria no pacote do navegador. O
// build quebra, ou a página carrega e morre.
//
// `import type` não tem esse problema (tipo some na compilação), mas um valor
// tem. Esta armadilha já mordeu: o mesmo projeto documenta a regra em
// `src/lib/training/pricing.ts` e em `src/lib/agenda-rotulos.ts`, e ainda
// assim a sub-aba de Relatórios nasceu quebrando-a. Por isso as constantes
// mudaram de casa em vez de só ganharem mais um comentário.
//
// `__tests__/lib/cliente-nao-importa-banco.test.ts` monta o grafo de imports e
// falha se qualquer componente de tela voltar a alcançar o banco.

export const STATUS_AGENDAMENTO = ['agendado', 'atendido', 'faltou', 'remarcou', 'desmarcou'] as const
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number]

export function ehStatusAgendamento(s: string): s is StatusAgendamento {
  return (STATUS_AGENDAMENTO as readonly string[]).includes(s)
}

// "Quais status seguram o horário" NÃO mora aqui: é `vivo()`, em
// `agenda-grade.ts`, que é puro e já é importado por componentes de tela.
// Acrescentar uma cópia aqui seria repetir o erro que este arquivo existe
// para impedir.
