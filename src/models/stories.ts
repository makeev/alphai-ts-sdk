import type { RequestOptions } from "./types";

/**
 * Stories (`/api/stories/*`): events that two or more publishers reported,
 * summarised by AlphAI from the articles themselves. `story_id` is the
 * permanent key every article row carries (`RichNewsArticle.story_id`): the uid
 * of the story's first root article, unchanged for the story's whole life.
 */

/**
 * `published`: the summary covers every article the story had when it was
 * written. `stale`: articles joined since; a rewrite is queued. `preparing`: no
 * summary yet — `title` and `summary` are the lead article's.
 */
export type StorySummaryState = "published" | "stale" | "preparing";

export type StoryLookupStatus = "found" | "merged" | "not_a_story";

export type StoryTickerImpact = "positive" | "negative" | "neutral";

/** A story in a list (top or latest). */
export interface StoryCard {
  /** Permanent story key — the same value article rows carry in `story_id`. */
  story_id: string;
  /** The summary's headline; in `preparing` state the lead article's own. */
  title: string;
  /** One paragraph: what happened, with the figures. */
  summary: string;
  /**
   * The feed's 1–10 scale: the median of each publisher's best-scored article
   * on the event, rounded down. Listed stories are 7 and above.
   */
  importance: number;
  category: string;
  tickers: string[];
  /** Distinct publishers — always 2 or more. */
  publishers: number;
  /** Visible articles in the story, reprints included. */
  materials: number;
  first_published_at: string | null;
  last_material_at: string | null;
  /** When the key facts last changed — the freshness the top list ranks by. */
  updated_at: string | null;
  summary_state: StorySummaryState;
}

export interface StoryKeyFact {
  text: string;
  /** The article the fact was read from (a row of the materials); empty when removed. */
  source_uid: string;
  publisher: string;
}

export interface StoryTickerTake {
  ticker: string;
  /** The summary's read of the event for this ticker — an editorial call. */
  impact: StoryTickerImpact;
  note: string;
}

/** The full story: a card plus the summary's body. */
export interface Story extends StoryCard {
  why_it_matters: string;
  /** Up to six facts, each attributed to the article it was read from. */
  key_facts: StoryKeyFact[];
  ticker_takes: StoryTickerTake[];
  uncertainties: string[];
  /** Articles whose text the model read ("based on N of M sources"). */
  based_on: number;
  /** The story's visible article count when the summary was written. */
  materials_at_build: number;
  /** Articles that joined after the summary was written (`stale` only). */
  new_materials: number;
  revision_generated_at: string | null;
  model: string;
  /** Whether alphai.io lets search engines index the story's page. Informational. */
  indexable: boolean;
}

/** One article behind a story; open it with `news.get(uid)`. */
export interface StoryMaterial {
  uid: string;
  title: string;
  publisher: string;
  time_published: string;
  url: string;
  relevance_score: number;
  seo_eligible: boolean;
}

export interface StoryMaterialsPage {
  story_id: string;
  results: StoryMaterial[];
  /** Next (newer) page; `null` at the end. */
  next_cursor: string | null;
}

export interface StoriesPage {
  results: StoryCard[];
  /** Next (older) page; `null` at the end. */
  next_cursor: string | null;
}

export interface TopStories {
  results: StoryCard[];
  as_of: string;
  /** The ranking formula's version; a change to the formula increments it. */
  ranking_version: number;
}

/** The single-publisher article a non-story id belongs to. */
export interface StoryArticleRef {
  uid: string;
  title: string;
  time_published: string;
}

/**
 * What a story id resolves to. `found`: `story` is filled. `merged`: folded
 * into another story, `redirect_to` is its id. `not_a_story`: one publisher
 * carried the event, so there is no summary; `article` names the row — the
 * normal answer for most feed rows. An unknown id throws `NotFoundError`.
 */
export interface StoryLookup {
  status: StoryLookupStatus;
  story?: Story | null;
  redirect_to?: string | null;
  article?: StoryArticleRef | null;
}

/** Options for {@link StoriesResource.list} and {@link StoriesResource.materials}. */
export interface StoriesPageOptions extends RequestOptions {
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Items per page, 1–50 on every tier (`limit` is the same thing on the wire). */
  pageSize?: number;
}

/** Options for {@link StoriesResource.iter} and {@link StoriesResource.iterMaterials}. */
export interface StoriesIterOptions extends RequestOptions {
  pageSize?: number;
  maxItems?: number;
  maxPages?: number;
}

/** Options for {@link StoriesResource.getStory}. */
export interface GetStoryOptions extends RequestOptions {
  /** How many `merged` redirects to follow (default 3). */
  followMerges?: number;
}
