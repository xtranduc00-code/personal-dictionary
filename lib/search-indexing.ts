/** When true, pages send noindex and sitemap is not advertised (direct links still work). */
export function blockSearchIndexing(): boolean {
    return process.env.NEXT_PUBLIC_BLOCK_SEARCH_INDEXING === "true";
}
