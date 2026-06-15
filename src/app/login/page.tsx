import Image from 'next/image'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="Instituto Torres"
            width={220}
            height={220}
            className="mx-auto mb-4"
            priority
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
