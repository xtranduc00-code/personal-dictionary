export default function ListeningTestLoading() {
    return (<div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
        <div className="h-9 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700"/>
      </div>
      <div className="h-14 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"/>
      <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"/>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"/>
        <div className="h-48 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"/>
      </div>
    </div>);
}
