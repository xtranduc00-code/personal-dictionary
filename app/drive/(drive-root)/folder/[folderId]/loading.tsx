import { SkeletonCard, SkeletonFolderCard } from "@gd/components/SkeletonCard";
export default function FolderLoading() {
    return (<div className="page-container">
      <section className="w-full">
        <div className="flex gap-2 mb-2">
          <div className="h-4 w-16 rounded bg-light-300"/>
          <span>/</span>
          <div className="h-4 w-24 rounded bg-light-300"/>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="h-10 w-40 rounded bg-light-300"/>
          <div className="flex gap-2">
            <div className="h-[52px] w-28 rounded-full bg-light-300"/>
            <div className="h-[52px] w-32 rounded-full bg-light-300"/>
          </div>
        </div>
      </section>
      <section className="mt-6">
        <div className="h-6 w-20 rounded bg-light-300 mb-3"/>
        <div className="file-list">
          {[1, 2, 3].map((i) => (<SkeletonFolderCard key={i}/>))}
        </div>
      </section>
      <section className="mt-6">
        <div className="h-6 w-16 rounded bg-light-300 mb-3"/>
        <div className="file-list">
          {[1, 2, 3, 4].map((i) => (<SkeletonCard key={i}/>))}
        </div>
      </section>
    </div>);
}
