export default function CalendarLoading() {
    return (<div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <div className="h-12 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800"/>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-700">
            {Array.from({ length: 7 }, (_, i) => (<div key={i} className="py-2">
                <div className="mx-auto h-3 w-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
              </div>))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-zinc-200 p-px dark:bg-zinc-700">
            {Array.from({ length: 35 }, (_, i) => (<div key={i} className="min-h-[88px] animate-pulse bg-zinc-50 dark:bg-zinc-900/80"/>))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800"/>
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800"/>
        </div>
      </div>
    </div>);
}
