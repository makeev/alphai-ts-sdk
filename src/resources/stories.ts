import type { HttpClient } from "../http";
import type {
  GetStoryOptions,
  StoriesIterOptions,
  StoriesPage,
  StoriesPageOptions,
  Story,
  StoryCard,
  StoryLookup,
  StoryMaterial,
  StoryMaterialsPage,
  TopStories,
} from "../models/stories";
import type { RequestOptions } from "../models/types";
import { paginate } from "../pagination";

function checkPageSize(method: string, pageSize: number | undefined): void {
  if (pageSize !== undefined && !(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50)) {
    throw new RangeError(`stories.${method}: \`pageSize\` must be an integer from 1 to 50`);
  }
}

function storyPath(method: string, storyId: string, suffix = ""): string {
  if (!storyId) throw new TypeError(`stories.${method}(storyId): \`storyId\` is required`);
  return `/api/stories/${encodeURIComponent(storyId)}/${suffix}`;
}

/**
 * Stories: events covered by two or more publishers, summarised from their
 * sources. Same tier rules as the news feeds — a cursor or a story past the
 * key's archive horizon throws `PermissionDeniedError` (`archive_horizon`).
 */
export class StoriesResource {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * `GET /api/stories/top/` — the strongest stories of the last 48 hours,
   * ranked: importance plus a coverage bonus, minus one point per 12 hours
   * since the facts last changed; one slot per ticker. Up to 50, no pagination.
   */
  top(options: RequestOptions = {}): Promise<TopStories> {
    return this.http.request<TopStories>("/api/stories/top/", { signal: options.signal });
  }

  /**
   * `GET /api/stories/` — one page of stories newest-first by their latest
   * article (default 20, `pageSize` 1–50 on every tier). Pass `next_cursor`
   * back as `cursor`.
   */
  list(options: StoriesPageOptions = {}): Promise<StoriesPage> {
    checkPageSize("list", options.pageSize);
    return this.http.request<StoriesPage>("/api/stories/", {
      query: { cursor: options.cursor, page_size: options.pageSize },
      signal: options.signal,
    });
  }

  /** Auto-paginate {@link list}, newest first. */
  iter(options: StoriesIterOptions = {}): AsyncGenerator<StoryCard> {
    const { maxItems, maxPages, ...rest } = options;
    return paginate<StoryCard>((next) => this.list({ ...rest, cursor: next }), {
      maxItems,
      maxPages,
    });
  }

  /**
   * `GET /api/stories/{story_id}/` — resolve a story id: the `story_id` of any
   * article row, or an id from `top()` / `list()`. Read `status` first: `found`
   * carries the story, `merged` names the surviving story in `redirect_to`,
   * `not_a_story` means one publisher carried the event and `article` names the
   * row. An unknown id throws `NotFoundError`.
   */
  get(storyId: string, options: RequestOptions = {}): Promise<StoryLookup> {
    return this.http.request<StoryLookup>(storyPath("get", storyId), { signal: options.signal });
  }

  /**
   * The story itself, following `merged` redirects (at most `followMerges`
   * hops, default 3); `null` when the id is `not_a_story`.
   */
  async getStory(storyId: string, options: GetStoryOptions = {}): Promise<Story | null> {
    const { followMerges = 3, ...rest } = options;
    let lookup = await this.get(storyId, rest);
    let hops = 0;
    while (lookup.status === "merged" && lookup.redirect_to && hops < followMerges) {
      lookup = await this.get(lookup.redirect_to, rest);
      hops++;
    }
    return lookup.story ?? null;
  }

  /**
   * `GET /api/stories/{story_id}/materials/` — the articles behind a story,
   * oldest first (default 50 per page). Only a current story has materials: a
   * merged or single-publisher id throws `NotFoundError` — resolve it with
   * {@link get} first.
   */
  materials(storyId: string, options: StoriesPageOptions = {}): Promise<StoryMaterialsPage> {
    checkPageSize("materials", options.pageSize);
    return this.http.request<StoryMaterialsPage>(storyPath("materials", storyId, "materials/"), {
      query: { cursor: options.cursor, page_size: options.pageSize },
      signal: options.signal,
    });
  }

  /** Every article behind a story, oldest first, across pages. */
  iterMaterials(storyId: string, options: StoriesIterOptions = {}): AsyncGenerator<StoryMaterial> {
    const { maxItems, maxPages, ...rest } = options;
    return paginate<StoryMaterial>((next) => this.materials(storyId, { ...rest, cursor: next }), {
      maxItems,
      maxPages,
    });
  }
}
