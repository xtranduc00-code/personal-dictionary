"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { sortTypes } from "@gd/constants";
export default function StarredSortSelect() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const current = searchParams.get("sort") || "$createdAt-desc";
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sort = e.target.value;
        const params = new URLSearchParams(searchParams.toString());
        if (sort && sort !== "$createdAt-desc")
            params.set("sort", sort);
        else
            params.delete("sort");
        const q = params.toString();
        router.push(`/drive/starred${q ? `?${q}` : ""}`);
    };
    return (<div className="sort-container">
      <label htmlFor="starred-sort" className="body-2 text-light-200 shrink-0">
        Sort:
      </label>
      <select id="starred-sort" value={current} onChange={handleChange} className="rounded-full border border-light-300 bg-white px-4 py-2 body-2 text-light-100 focus:outline-none focus:ring-2 focus:ring-brand/50">
        {sortTypes.map((opt) => (<option key={opt.value} value={opt.value}>
            {opt.label}
          </option>))}
      </select>
    </div>);
}
