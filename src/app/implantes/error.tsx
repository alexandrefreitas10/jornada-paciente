'use client'

export default function ImplantesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
        <p className="text-4xl">⚠️</p>
        <h1 className="text-lg font-bold text-gray-800">Erro ao carregar Implantes</h1>
        <p className="text-sm text-gray-500 font-mono bg-gray-50 p-3 rounded-lg text-left break-words">{error?.message || 'Erro desconhecido'}</p>
        <button onClick={reset} className="w-full py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700">
          Tentar novamente
        </button>
        <a href="/" className="block text-sm text-gray-400 hover:text-gray-600">← Voltar ao início</a>
      </div>
    </div>
  )
}
