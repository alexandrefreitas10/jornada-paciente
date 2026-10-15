// Tipos da leitura da fatura do cartão. Sem imports de propósito: a leitura é
// determinística (nada de IA, nada de banco) e estes tipos viajam até a tela.

export interface CompraCartao {
  data: string            // AAAA-MM-DD
  estabelecimento: string
  parcela: string | null  // "2/5"
  centavos: number        // positivo: é despesa
  internacional: boolean
}

export interface FaturaLida {
  referencia: string          // AAAA-MM
  totalFatura: number         // SALDO TOTAL
  despesasDeclaradas: number  // DESPESAS/DÉBITOS
  faturaAnterior: number      // TOTAL FATURA ANTERIOR
  compras: CompraCartao[]
  /** soma(compras) - despesasDeclaradas. Zero = a leitura fecha. */
  residuo: number
}
