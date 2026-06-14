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
   */
  list(options: NewsListOptions = {}): Promise<NewsPage> {
    return this.http.request<NewsPage>("/api/news/", {
      query: newsQuery(options),
      signal: options.signal,
    });
  }

  /**
   * Iterate the main feed across pages, following `next_cursor` automatically.
   * Honors optional `maxItems` / `maxPages` caps.
   */
  iterate(options: NewsIterateOptions = {}): AsyncGenerator<RichNewsArticle> {
    const { maxItems, maxPages, cursor, ...rest } = options;
    return paginate<RichNewsArticle>((next) => this.list({ ...rest, cursor: next }), {
      initialCursor: cursor,
      maxItems,
      maxPages,
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

  /** `GET /api/news/insider/` — the `category=insider` feed (SEC Form 4 + institutional stakes). */
  insider(options: InsiderListOptions = {}): Promise<NewsPage> {
    return this.http.request<NewsPage>("/api/news/insider/", {
      query: { cursor: options.cursor, symbol: options.symbol },
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
