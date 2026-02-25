export default function RootLoading() {
    return (<div className="dashboard-container animate-pulse">
      <section>
        <div className="rounded-[20px] bg-light-300 h-[200px] w-full max-w-2xl"/>
        <ul className="dashboard-summary-list">
          {[1, 2, 3, 4, 5].map((i) => (<div key={i} className="dashboard-summary-card rounded-[20px] bg-light-300 h-40"/>))}
        </ul>
      </section>
      <section className="dashboard-recent-files">
        <div className="h-8 w-40 rounded bg-light-300 mb-5"/>
        <ul className="mt-5 flex flex-col gap-5">
          {[1, 2, 3].map((i) => (<div key={i} className="flex items-center gap-3 rounded-lg p-2">
              <div className="size-10 rounded bg-light-300"/>
              <div className="flex-1 space-y-1">
                <div className="h-4 w-48 rounded bg-light-300"/>
                <div className="h-3 w-24 rounded bg-light-300"/>
              </div>
            </div>))}
        </ul>
      </section>
    </div>);
}
