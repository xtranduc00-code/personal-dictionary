export function SkeletonCard() {
    return (<div className="flex flex-col gap-6 rounded-[18px] bg-white p-5 shadow-sm animate-pulse">
      <div className="flex justify-between">
        <div className="size-20 rounded-lg bg-light-300"/>
        <div className="flex flex-col items-end gap-2">
          <div className="h-4 w-8 rounded bg-light-300"/>
          <div className="h-4 w-12 rounded bg-light-300"/>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-3/4 rounded bg-light-300"/>
        <div className="h-3 w-1/2 rounded bg-light-300"/>
        <div className="h-3 w-1/3 rounded bg-light-300"/>
      </div>
    </div>);
}
export function SkeletonFolderCard() {
    return (<div className="flex flex-col gap-6 rounded-[18px] bg-white p-5 shadow-sm animate-pulse">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="size-[50px] rounded-full bg-light-300"/>
          <div className="h-4 w-32 rounded bg-light-300"/>
        </div>
        <div className="size-8 rounded bg-light-300"/>
      </div>
    </div>);
}
