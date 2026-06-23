import { getAuditLogs } from '@/lib/audit'
import { AuditoriaClient } from './AuditoriaClient'

export default async function AuditoriaPage() {
  const logs = await getAuditLogs()
  return <AuditoriaClient logs={logs} />
}
