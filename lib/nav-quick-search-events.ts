/** Đồng bộ xóa ô "Quick search" (sidebar) từ trang khác, ví dụ sau khi chọn note. */
export const CLEAR_NAV_QUICK_SEARCH_EVENT = "kfc:clear-nav-quick-search";

export function dispatchClearNavQuickSearch(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLEAR_NAV_QUICK_SEARCH_EVENT));
}
