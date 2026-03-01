export default function HistoryLoading() {
    return (<div className="space-y-4">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700"/>
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4, 5].map((i) => (<div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"/>))}
      </div>
    </div>);
}
