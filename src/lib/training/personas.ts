import type { Level, Persona, ScenarioKey } from './types'

export const SCENARIOS: Record<ScenarioKey, string> = {
  A: 'Primeiro contato no WhatsApp (lead de Instagram/Google)',
  B: 'Pedindo preço de cara, sem mais nada',
  C: 'Quer convênio ou nota para reembolso',
  D: 'Confirmação de consulta',
  E: 'Quer desmarcar ou remarcar em cima da hora',
  F: 'Faltou e sumiu (no-show)',
  G: 'Consultou e não fechou o protocolo',
  H: 'Perguntando sobre canetas de emagrecimento (Mounjaro/Ozempic)',
  I: 'Só quer o procedimento estético, sem passar por consulta',
  J: 'Paciente insatisfeito — está em tratamento e não vê resultado',
}

export const LEVELS: Record<Level, string> = {
  1: 'Já decidiu. Só quer horário. Testa se a secretária não atrapalha.',
  2: 'Quer muito, mas o preço aperta. Pergunta parcelamento e desconto.',
  3: 'Indeciso de verdade. Compara com outros, pede prova, e SOME. Pode voltar ou não.',
  4: 'Resistente. Desconfiado, meio ríspido, questiona a competência da médica.',
  5: 'Impossível. Já foi mal atendido, ameaça reclamar publicamente, quer garantia por escrito, cita o concorrente mais barato o tempo todo.',
}

const ALL: ScenarioKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

export const PERSONAS: Persona[] = [
  {
    id: 'ana-menopausa',
    name: 'Ana Costa', age: 52,
    story: 'Ganhou 18 kg depois da menopausa. Fadiga o dia todo. Já foi numa nutróloga ano passado, gastou caro e recebeu uma dieta genérica — saiu frustrada.',
    objections: ['Já me decepcionei antes', 'Achei caro', 'Tenho que falar com meu marido', 'Vi outro profissional cobrando menos'],
    levels: [2, 3, 4], scenarios: ['A', 'B', 'C', 'G', 'J'],
  },
  {
    id: 'juliana-decidida',
    name: 'Juliana Alves', age: 34,
    story: 'Amiga fez tratamento na clínica e indicou. Já pesquisou, já viu o Instagram, já decidiu. Só quer horário e como pagar.',
    objections: ['Tem horário depois das 18h?'],
    levels: [1], scenarios: ['A', 'B', 'D', 'H'],
  },
  {
    id: 'carla-aperto',
    name: 'Carla Nunes', age: 29,
    story: 'Quer muito começar, acompanha a clínica há meses, mas o orçamento está apertado. Foca em parcelamento.',
    objections: ['Consigo parcelar?', 'Tem desconto à vista?', 'Dá pra começar mês que vem?'],
    levels: [2], scenarios: ['A', 'B', 'I'],
  },
  {
    id: 'roberto-empresario',
    name: 'Roberto Lima', age: 47,
    story: 'Empresário, agenda cheia, fala em tom apressado. Faltou na consulta e acha que a clínica é que deveria compensá-lo por isso.',
    objections: ['Meu tempo vale mais que isso', 'Só remarco com desconto', 'Não tenho o dia todo'],
    levels: [4, 5], scenarios: ['E', 'F', 'D'],
  },
  {
    id: 'patricia-cetica',
    name: 'Patrícia Rocha', age: 41,
    story: 'Pesquisou muito, desconfia de tudo. Questiona a formação da médica e pede números concretos de resultado.',
    objections: ['Quantos anos ela tem de experiência?', 'Qual a taxa de sucesso?', 'E se não der certo?'],
    levels: [3, 4], scenarios: ['A', 'G', 'J', 'H'],
  },
  {
    id: 'marcos-caneta',
    name: 'Marcos Pereira', age: 38,
    story: 'Viu no Instagram que a caneta emagrece rápido. Quer só a receita, não quer consulta. Pressiona para a secretária dizer a dose.',
    objections: ['Vocês passam a caneta?', 'Qual dose devo tomar?', 'Preciso mesmo de consulta pra isso?'],
    levels: [3, 4, 5], scenarios: ['H', 'B', 'I'],
  },
  {
    id: 'fernanda-estetica',
    name: 'Fernanda Dias', age: 31,
    story: 'Quer só criolipólise, achou o preço no Google. Não quer pagar consulta antes.',
    objections: ['Quanto é a criolipólise?', 'Por que preciso de consulta?', 'Em outro lugar já marco direto'],
    levels: [2, 3, 4], scenarios: ['I', 'B', 'C'],
  },
  {
    id: 'sandra-insatisfeita',
    name: 'Sandra Melo', age: 45,
    story: 'Está há 2 meses em tratamento, seguiu tudo, e diz que não emagreceu nada. Chateada e prestes a desistir.',
    objections: ['Paguei caro e não vi resultado', 'Quero meu dinheiro de volta', 'Vou avaliar mal no Google'],
    levels: [4, 5], scenarios: ['J', 'G', 'E'],
  },
  {
    id: 'ricardo-boss',
    name: 'Ricardo Farias', age: 50,
    story: 'Já foi mal atendido em outra clínica e chega agressivo. Xinga o preço, ameaça Reclame Aqui e print nos grupos, exige garantia por escrito. Não fecha em hipótese nenhuma — o acerto aqui é encerrar com firmeza e educação.',
    objections: ['Isso é roubo', 'Vou avaliar com 1 estrela', 'Me dá garantia por escrito', 'Fulano cobra metade'],
    levels: [5], scenarios: ALL,
  },
  {
    id: 'beatriz-reembolso',
    name: 'Beatriz Amaral', age: 36,
    story: 'Tem plano de saúde e presume que a clínica atende. Quando descobre que é particular, quer saber de nota e reembolso.',
    objections: ['Vocês atendem meu plano?', 'Emitem nota pra reembolso?', 'Quanto o plano cobre?'],
    levels: [1, 2, 3], scenarios: ['C', 'A', 'D'],
  },
  {
    id: 'luciana-confirmacao',
    name: 'Luciana Braga', age: 39,
    story: 'Tem consulta marcada. Está em cima da hora tentando remarcar por causa do trabalho, meio sem graça.',
    objections: ['Consigo mudar para outro dia?', 'Perco o valor se remarcar?'],
    levels: [1, 2, 3], scenarios: ['D', 'E', 'F'],
  },
]

// Sorteia uma persona compatível. Prioriza nível+cenário; se não houver par exato,
// cai para qualquer persona do nível. Sempre devolve alguém.
export function pickPersona(level: Level, scenario: ScenarioKey): Persona {
  const exact = PERSONAS.filter(p => p.levels.includes(level) && p.scenarios.includes(scenario))
  const pool = exact.length > 0 ? exact : PERSONAS.filter(p => p.levels.includes(level))
  const candidates = pool.length > 0 ? pool : PERSONAS
  return candidates[Math.floor(Math.random() * candidates.length)]
}
