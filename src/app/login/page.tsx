import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-it.png"
            alt="Instituto Torres"
            style={{ height: '160px', width: 'auto', margin: '0 auto 16px' }}
          />
          <p className="text-sm text-gray-500">Entre com suas credenciais</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
