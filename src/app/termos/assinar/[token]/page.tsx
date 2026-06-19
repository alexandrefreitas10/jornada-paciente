import { SignTermPage } from './SignTermPage'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <SignTermPage params={params} />
}
