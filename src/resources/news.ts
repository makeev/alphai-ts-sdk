import { AlphaAIError } from "../errors";
import type { HttpClient, QueryParams } from "../http";
import type { NewsBrief, NewsBriefOptions } from "../models/brief";
import type {
  InsiderCluster,
  InsiderClustersIterateOptions,
  InsiderClustersOptions,
  InsiderClustersPage,
} from "../models/clusters";
import type { NewsSearchOptions, NewsSearchPage } from "../models/search";
import type {
  CategoryFilter,
  DateBound,
  InsiderCsvExport,
  InsiderCsvOptions,
  InsiderIterateOptions,
  InsiderListOptions,
  NewsIterateOptions,
  NewsListOptions,
  NewsPage,
  RequestOptions,
  RichNewsArticle,
} from "../models/types";
import { paginate } from "../pagination";
import { integerRange, tickerCSV } from "./snapshot-params";

/**
 * Serialize a `fromDate` / `toDate` bound. Strings pass through untouched so
 * the bare `"YYYY-MM-DD"` whole-day form (and any server-accepted ISO
 * spelling) survives verbatim; a `Date` becomes the exact instant in UTC.
 */
function dateParam(value: DateBound | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

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
    from_date: dateParam(options.fromDate),
    to_date: dateParam(options.toDate),
    source_type: normalizeCategories(options.sourceType),
    item: options.item,
    event_type: normalizeCategories(options.eventType),
  };
}

function insiderQuery(options: InsiderListOptions): QueryParams {
  return {
    cursor: options.cursor,
    symbol: options.symbol,
    min_relevance: options.minRelevance,
    is_10b5_1: options.is10b5_1,
    decision: options.decision,
    page_size: options.pageSize,
    sort: options.sort,
    from_date: dateParam(options.fromDate),
    to_date: dateParam(options.toDate),
  };
}

/**
 * `Accept` for `format=csv`. The API answers `format=csv` together with an
 * `Accept: application/json` (the SDK's default) with 406; error bodies stay
 * JSON either way.
 */
const CSV_ACCEPT = "text/csv, application/json;q=0.9";

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

async function parseInsiderCsv(response: Response): Promise<InsiderCsvExport> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("text/csv")) {
    void response.body?.cancel().catch(() => {});
    throw new AlphaAIError(
      `Expected a text/csv body from the insider export, got ${JSON.stringify(contentType || "none")}`,
    );
  }
  const truncated = response.headers.get("x-alphai-truncated");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null;
  return {
    text: await response.text(),
    rows: headerInt(response.headers, "x-alphai-rows"),
    row_cap: headerInt(response.headers, "x-alphai-row-cap"),
    truncated: truncated === null || truncated === "" || truncated === "false" ? null : truncated,
    next_cursor: response.headers.get("x-alphai-next-cursor") || null,
    filename,
  };
}

/** News endpoints: the main feed, trending, insider feed, and single-article lookups. */
export class NewsResource {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Search article text without resolving the query to a ticker. Inspect query.mode
   * and query.note: broadened results can match only some words, and no_match is
   * limited to the searched window and coverage. matched is bounded to the best 200.
   * Pass next_cursor with the same query, filters and window for the next page.
   * Invalid cursors raise BadRequestError; unavailable search raises ServerError.
   */
  search(options: NewsSearchOptions): Promise<NewsSearchPage> {
    return this.http.request<NewsSearchPage>("/api/news/search/", {
      query: {
        q: options.query,
        symbol: options.symbol,
        category: normalizeCategories(options.category),
        source_type: normalizeCategories(options.sourceType),
        item: options.item,
        min_relevance: options.minRelevance,
        collapse: options.collapseStories ? "story" : undefined,
        cursor: options.cursor,
        page_size: options.pageSize,
        from_date: dateParam(options.fromDate),
        to_date: dateParam(options.toDate),
      },
      signal: options.signal,
    });
  }

  /**
   * Grouped news, SEC filings and confirmed earnings dates for explicit tickers.
   * A ranked publication snapshot, not a delta stream. Inspect unknown_tickers,
   * events_truncated and filings_truncated. Each section has its own limit.
   */
  brief(options: NewsBriefOptions): Promise<NewsBrief> {
    integerRange("hours", options.hours, 1, 168);
    integerRange("limit", options.limit, 1, 20);
    return this.http.request<NewsBrief>("/api/news/brief/", {
      query: {
        tickers: tickerCSV(options.tickers, 20, 100),
        hours: options.hours,
        limit: options.limit,
      },
      signal: options.signal,
    });
  }

  /**
   * `GET /api/news/` — the main feed, newest first. Defaults server-side to
   * `relevance_score >= 4` and at least one ticker. Returns one page.
   *
   * Pass `sort: "ingested"` to poll for what is new instead of reading the top
   * of the feed: rows come back in arrival order, `next_cursor` is always set,
   * and an empty `results` means you are caught up. Cursors are mode-specific,
   * so send the same `sort` on every call of a run.
   *
   * `sourceType` selects press (`gdelt`) or SEC filings (`sec_form4`,
   * `sec_form8k`, `sec_form6k`); `item` (e.g. `"5.02"`) keeps 8-Ks carrying
   * that item and implies `sec_form8k`. 8-K rows carry the `filing` block.
   *
   * `eventType` (e.g. `"buyback"`, `["dividend", "buyback"]`) keeps rows whose
   * `event` block is of that corporate event type, as the main event or inside
   * `event.also`. It works in the default order only: next to
   * `sort: "ingested"`, or with an unknown type, the API answers 400
   * (`BadRequestError`).
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
   *
   * Every sale's `insider` block carries the sale label (`decision`,
   * `decision_reason`). `decision: "discretionary"` keeps the sales an insider
   * chose to make, `"plan_like"` the ones that follow from a 10b5-1 plan or
   * from paperwork, `"unknown"` the ones the filing does not say enough about.
   * It combines with `is10b5_1`, `sort` and the other filters; any other value
   * is a 400 (`BadRequestError`). `is10b5_1: false` alone still includes tax
   * sales and exercise covers.
   */
  insider(options: InsiderListOptions = {}): Promise<NewsPage> {
    return this.http.request<NewsPage>("/api/news/insider/", {
      query: insiderQuery(options),
      signal: options.signal,
    });
  }

  /**
   * `GET /api/news/insider/?format=csv` — the insider feed as one CSV file,
   * same filters. One row per insider event, walked on the server up to your
   * plan's row cap (Free 500, Basic 2 000, Pro 10 000) inside its archive
   * horizon; the file counts as one request and never fails part-way.
   *
   * Check `truncated` (`"row_cap"` / `"archive_horizon"`, `null` when the
   * file holds everything) and continue a capped file with `next_cursor`,
   * which {@link NewsResource.insider} accepts too (same `sort`). Validation
   * errors are the JSON feed's 400s, raised before any row.
   *
   * The file's last two columns are `decision` and `decision_reason` (empty
   * for an event without a sale). The file is returned as sent, so columns the
   * API appends later arrive without an SDK update.
   */
  async insiderCsv(options: InsiderCsvOptions = {}): Promise<InsiderCsvExport> {
    const response = await this.http.send("/api/news/insider/", {
      query: { ...insiderQuery(options), page_size: undefined, format: "csv" },
      signal: options.signal,
      accept: CSV_ACCEPT,
    });
    return parseInsiderCsv(response);
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

  /**
   * `GET /api/news/insider/clusters/` — insider cluster buys: episodes in which
   * several different insiders of one issuer bought on the open market
   * together. An issuer's Form 4 purchase dates are chained into one episode
   * while consecutive purchases are at most 10 days apart (cut at 30 days), and
   * every purchase inside it is examined before a buyer counts: IPO or PIPE
   * allocations, ESPP / DRIP / director-plan lots, unpriced units and the same
   * trade reported through two owners are labeled per buyer (`role`) rather
   * than counted. The episode's `pattern` is `open_market` when at least two
   * independent buyers remain and one is an officer or director; the default
   * lists only those — ask `pattern: "plan_or_offering"`, `"holders_only"` or
   * `"all"` for the rest.
   *
   * `days` (1–90, default 30) is measured on `known_at`, when the episode's
   * latest filing reached EDGAR, so "what became known this month" is one
   * call; deeper than the key's archive horizon (Free 30, Basic 90) throws
   * `PermissionDeniedError` (`archive_horizon`). Cursors are sort-specific.
   * A descriptive screen, not point-in-time and with no returns attached
   * (`meta.research_only`); coverage starts at `meta.coverage_since`. Ranges
   * are checked locally (`RangeError`) before any request.
   */
  insiderClusters(options: InsiderClustersOptions = {}): Promise<InsiderClustersPage> {
    integerRange("days", options.days, 1, 90);
    integerRange("minBuyers", options.minBuyers, 2, 10);
    integerRange("minUsd", options.minUsd, 0);
    integerRange("pageSize", options.pageSize, 1, 50);
    return this.http.request<InsiderClustersPage>("/api/news/insider/clusters/", {
      query: {
        days: options.days,
        min_buyers: options.minBuyers,
        min_usd: options.minUsd,
        pattern: options.pattern,
        symbol: options.symbol,
        sort: options.sort,
        cursor: options.cursor,
        page_size: options.pageSize,
      },
      signal: options.signal,
    });
  }

  /**
   * Iterate {@link NewsResource.insiderClusters} across pages, following
   * `next_cursor` with the same filters and `sort` on every page.
   */
  iterateInsiderClusters(
    options: InsiderClustersIterateOptions = {},
  ): AsyncGenerator<InsiderCluster> {
    const { maxItems, maxPages, cursor, ...rest } = options;
    return paginate<InsiderCluster>((next) => this.insiderClusters({ ...rest, cursor: next }), {
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
