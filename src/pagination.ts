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
 * `null`, until it stops advancing, or until a `maxItems` / `maxPages` cap is
 * reached.
 *
 * The "stops advancing" condition is what terminates a `sort: "ingested"` run.
 * Delta mode has no end of feed: `next_cursor` is ALWAYS set, and a caught-up
 * poll returns an empty page carrying the same cursor it was given. Without
 * this check the loop would spin against the API until it hit the rate limit.
 * It also bounds any server that pins its cursor for another reason.
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
    if (!next || next === cursor) return;
    cursor = next;
  }
}
