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
  /**
   * Treat an empty page as the end of the run. Set this for `sort: "ingested"`,
   * where an empty `results` is the ONLY reliable "caught up" signal.
   *
   * Do NOT set it for the default published mode: a page there can legitimately
   * come back empty and still have more behind it, because the keyset advances
   * by scanned rows while some are filtered out before they are emitted.
   */
  stopOnEmptyPage?: boolean;
}

/**
 * Async generator over a cursor-paginated endpoint. Calls `fetchPage` with the
 * current cursor, yields each item, then follows `next_cursor` until the run
 * ends or a `maxItems` / `maxPages` cap is reached.
 *
 * Termination in `sort: "ingested"` mode needs `stopOnEmptyPage`, because delta
 * mode has no end of feed: `next_cursor` is ALWAYS set, and a caught-up poll
 * parks the position at the GLOBAL feed head — which advances whenever any row
 * is ingested, not just one matching the caller's filter. So the cursor can
 * keep moving across empty pages, and a cursor comparison alone does not stop a
 * filtered drain; it merely raced against the ingest rate and burned rate-limit
 * budget when it lost. The `next === cursor` check remains as a backstop
 * against a server that pins its cursor for any other reason.
 */
export async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<CursorPage<T>>,
  options: PaginateOptions = {},
): AsyncGenerator<T> {
  const { maxItems, maxPages, stopOnEmptyPage } = options;
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
    if (stopOnEmptyPage === true && results.length === 0) return;

    const next = page.next_cursor;
    if (!next || next === cursor) return;
    cursor = next;
  }
}
