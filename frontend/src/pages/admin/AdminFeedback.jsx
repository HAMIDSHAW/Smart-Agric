import { useState } from 'react'
import { adminAPI } from '../../services/api'
import { useAsync, Card, Skeleton, ErrorState, EmptyState, Pagination, fmtDate } from '../../components/admin/ui'

export default function AdminFeedback() {
  const [page, setPage] = useState(1)
  const { loading, data, error, reload } = useAsync(() => adminAPI.feedback(page), [page])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Farmer feedback</h1>
      {loading && <Skeleton className="h-40" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState title="No feedback yet" />}
      {data && data.items.map((f) => (
        <Card key={f.id}>
          <p className="font-semibold">{f.subject}</p>
          <p className="text-xs text-slate-500">{f.name}{f.email ? ` · ${f.email}` : ''} · {fmtDate(f.created_at)}</p>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words">{f.message}</p>
        </Card>))}
      {data && <Pagination page={page} pages={data.pages} onPage={setPage} />}
    </div>
  )
}
