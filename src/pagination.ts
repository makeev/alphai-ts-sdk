/** A cursor-paginated page returned by the news feed endpoints. */
interface CursorPage<T> {
  results: T[];
  next_cursor: string | null;
}

export interface PaginateOptions {
  /** Cursor to start from (resume a previous iteration). */
  initialCursor?: string;
  /** Stop after yielding this many items. */
  maxItems?: number;
  /** Stop after fetching this many pages. */
  maxPages?: number;
}

/**
 * Async generator over a cursor-paginated endpoint. Calls `fetchPage` with the
 * current cursor, yields each item, then follows `next_cursor` until it is
 * `null` or a `maxItems` / `maxPages` cap is reached.
 */
export async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<CursorPage<T>>,
  options: PaginateOptions = {},
): AsyncGenerator<T> {
  const { maxItems, maxPages } = options;
  let cursor = options.initialCursor;
  let items = 0;
  let pages = 0;

  while (true) {
    if (maxItems !== undefined && items >= maxItems) return;

    const page = await fetchPage(cursor);
    const results = page.results ?? [];

    for (const item of results) {
      if (maxItems !== undefined && items >= maxItems) return;
      yield item;
      items++;
    }

    pages++;
    if (maxPages !== undefined && pages >= maxPages) return;

    const next = page.next_cursor;
    if (!next) return;
    cursor = next;
  }
}
