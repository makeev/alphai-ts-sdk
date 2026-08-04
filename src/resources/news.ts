import type { HttpClient, QueryParams } from "../http";
import type {
  CategoryFilter,
  InsiderIterateOptions,
  InsiderListOptions,
  NewsIterateOptions,
  NewsListOptions,
  NewsPage,
  RequestOptions,
  RichNewsArticle,
} from "../models/types";
import { paginate } from "../pagination";

/** Normalize a category filter (single / array / CSV string) into a string array. */
function normalizeCategories(value: CategoryFilter | undefined): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of list) {
    for (const part of String(entry).split(",")) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out.length > 0 ? out : undefined;
}

function newsQuery(options: NewsListOptions): QueryParams {
  return {
    cursor: options.cursor,
    symbol: options.symbol,
    category: normalizeCategories(options.category),
    exclude_categories: normalizeCategories(options.excludeCategories),
    min_relevance: options.minRelevance,
    collapse: options.collapseStories ? "story" : undefined,
    page_size: options.pageSize,
    sort: options.sort,
  };
}

/** News endpoints: the main feed, trending, insider feed, and single-article lookups. */
export class NewsResource {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * `GET /api/news/` — the main feed, newest first. Defaults server-side to
   * `relevance_score >= 6` and at least one ticker. Returns one page.
   *
   * Pass `sort: "ingested"` to poll for what is new instead of reading the top
   * of the feed: rows come back in arrival order, `next_cursor` is always set,
   * and an empty `results` means you are caught up. Cursors are mode-specific,
   * so send the same `sort` on every call of a run.
   */
  list(options: NewsListOptions = {}): Promise<NewsPage> {
    return this.http.request<NewsPage>("/api/news/", {
      query: newsQuery(options),
      signal: options.signal,
    });
  }

  /**
   * Iterate the main feed across pages, following `next_cursor` automatically.
   * Honors optional `maxItems` / `maxPages` caps, and `cursor` to resume.
   *
   * With `sort: "ingested"` this drains what is currently new and stops on the
   * first empty page (delta mode has no null cursor, and its cursor keeps
   * advancing even when nothing matched). `sort` is threaded onto every page,
   * so the run never replays a cursor into the other mode.
   */
  iterate(options: NewsIterateOptions = {}): AsyncGenerator<RichNewsArticle> {
    const { maxItems, maxPages, cursor, ...rest } = options;
    return paginate<RichNewsArticle>((next) => this.list({ ...rest, cursor: next }), {
      initialCursor: cursor,
      maxItems,
      maxPages,
      stopOnEmptyPage: rest.sort === "ingested",
    });
  }

  /**
   * `GET /api/news/trending/` — up to 10 ranked stories from the last 48 hours
   * (score >= 8), reprints collapsed. Not paginated.
   */
  trending(options: RequestOptions = {}): Promise<RichNewsArticle[]> {
    return this.http.request<RichNewsArticle[]>("/api/news/trending/", {
      signal: options.signal,
    });
  }

  /**
   * `GET /api/news/insider/` — the `category=insider` feed (SEC Form 4 filings).
   *
   * Supports `sort: "ingested"` under the same delta-polling contract as
   * {@link NewsResource.list}, with its own cursor family.
   */
  insider(options: InsiderListOptions = {}): Promise<NewsPage> {
    return this.http.request<NewsPage>("/api/news/insider/", {
      query: {
        cursor: options.cursor,
        symbol: options.symbol,
        min_relevance: options.minRelevance,
        page_size: options.pageSize,
        sort: options.sort,
      },
      signal: options.signal,
    });
  }

  /** Iterate the insider feed across pages, following `next_cursor` automatically. */
  iterateInsider(options: InsiderIterateOptions = {}): AsyncGenerator<RichNewsArticle> {
    const { maxItems, maxPages, cursor, ...rest } = options;
    return paginate<RichNewsArticle>((next) => this.insider({ ...rest, cursor: next }), {
      initialCursor: cursor,
      maxItems,
      maxPages,
      stopOnEmptyPage: rest.sort === "ingested",
    });
  }

  /** `GET /api/news/{uid}/` — a single article. `uid` is a 16-character hex id. */
  get(uid: string, options: RequestOptions = {}): Promise<RichNewsArticle> {
    if (!uid) throw new TypeError("news.get(uid): `uid` is required");
    return this.http.request<RichNewsArticle>(`/api/news/${encodeURIComponent(uid)}/`, {
      signal: options.signal,
    });
  }

  /** `GET /api/news/{uid}/related/` — up to 6 related articles. */
  related(uid: string, options: RequestOptions = {}): Promise<RichNewsArticle[]> {
    if (!uid) throw new TypeError("news.related(uid): `uid` is required");
    return this.http
      .request<{ results: RichNewsArticle[] }>(`/api/news/${encodeURIComponent(uid)}/related/`, {
        signal: options.signal,
      })
      .then((res) => res.results ?? []);
  }
}
