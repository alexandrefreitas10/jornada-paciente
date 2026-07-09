import { PortalLoginForm } from './PortalLoginForm'

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl mx-auto mb-4">
            🌸
          </div>
          <h1 className="text-xl font-bold text-gray-900">Área do Paciente</h1>
          <p className="text-sm text-gray-500 mt-1">Acesse suas informações de tratamento</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <PortalLoginForm />
        </div>
      </div>
    </div>
  )
}
