export default function ListeningLoading() {
    return (<div className="mx-auto max-w-4xl space-y-8 px-4 py-6">
      <div className="h-8 w-56 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
      <div className="h-4 w-full max-w-md animate-pulse rounded bg-zinc-100 dark:bg-zinc-800"/>
      <div className="mt-8 space-y-4">
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (<div key={i} className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"/>))}
        </div>
      </div>
    </div>);
}
