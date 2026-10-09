import { describe, expect, it } from "vitest";
import { NotFoundError, PermissionDeniedError } from "../src";
import storiesPage from "./fixtures/stories-page.json";
import storiesTop from "./fixtures/stories-top.json";
import storyMaterials from "./fixtures/story-materials.json";
import story from "./fixtures/story.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

const STORY_ID = "e58bf00bbc0d44ca";

describe("stories endpoints", () => {
  it("parses the top list", async () => {
    const fetch = mockFetch(() => jsonResponse(storiesTop));
    const client = makeClient(fetch);

    const top = await client.stories.top();

    expect(fetch.calls[0].url).toBe("https://api.alphai.io/api/stories/top/");
    expect(top.ranking_version).toBe(1);
    expect(top.results[0].story_id).toBe(STORY_ID);
    expect(top.results[0].importance).toBeGreaterThanOrEqual(7);
    expect(top.results[0].publishers).toBeGreaterThanOrEqual(2);
    expect(["published", "stale", "preparing"]).toContain(top.results[0].summary_state);
  });

  it("sends page_size and cursor on list, and iter follows next_cursor", async () => {
    const last = { results: storiesPage.results.slice(0, 1), next_cursor: null };
    const fetch = mockFetch((_url, _init, call) => jsonResponse(call === 1 ? storiesPage : last));
    const client = makeClient(fetch);

    const page = await client.stories.list({ pageSize: 2 });
    expect(page.results).toHaveLength(2);
    expect(page.next_cursor).toBeTruthy();
    expect(new URL(fetch.calls[0].url).searchParams.get("page_size")).toBe("2");
    expect(new URL(fetch.calls[0].url).searchParams.has("cursor")).toBe(false);

    const fetch2 = mockFetch((_url, _init, call) => jsonResponse(call === 1 ? storiesPage : last));
    const client2 = makeClient(fetch2);
    const ids: string[] = [];
    for await (const card of client2.stories.iter({ pageSize: 2 })) ids.push(card.story_id);
    expect(ids).toHaveLength(3);
    expect(new URL(fetch2.calls[1].url).searchParams.get("cursor")).toBe(storiesPage.next_cursor);
  });

  it("validates pageSize and storyId locally", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(storiesPage)));
    expect(() => client.stories.list({ pageSize: 0 })).toThrow(RangeError);
    expect(() => client.stories.materials(STORY_ID, { pageSize: 51 })).toThrow(RangeError);
    expect(() => client.stories.get("")).toThrow(TypeError);
  });

  it("resolves a found story with facts, takes and build counters", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(story)));

    const lookup = await client.stories.get(STORY_ID);

    expect(lookup.status).toBe("found");
    const found = lookup.story;
    expect(found?.story_id).toBe(STORY_ID);
    expect(found?.key_facts.length).toBeGreaterThan(0);
    expect(found?.key_facts[0].publisher).toBeTruthy();
    expect(found?.key_facts[0].source_uid).toMatch(/^[a-f0-9]{16}$/);
    for (const take of found?.ticker_takes ?? []) {
      expect(["positive", "negative", "neutral"]).toContain(take.impact);
    }
    expect(found?.based_on).toBeLessThanOrEqual(found?.materials_at_build ?? 0);
    expect(JSON.stringify(lookup)).not.toContain("raw_text");
  });

  it("getStory follows merges and returns null for a single-publisher id", async () => {
    const fetch = mockFetch((url) => {
      if (url.endsWith("/api/stories/aaaaaaaaaaaaaaaa/")) {
        return jsonResponse({ status: "merged", redirect_to: STORY_ID });
      }
      if (url.endsWith(`/api/stories/${STORY_ID}/`)) return jsonResponse(story);
      return jsonResponse({
        status: "not_a_story",
        article: { uid: "bbbbbbbbbbbbbbbb", title: "Lone", time_published: "2026-10-09T06:00:00Z" },
      });
    });
    const client = makeClient(fetch);

    const merged = await client.stories.getStory("aaaaaaaaaaaaaaaa");
    expect(merged?.story_id).toBe(STORY_ID);
    expect(fetch.calls).toHaveLength(2);

    expect(await client.stories.getStory("bbbbbbbbbbbbbbbb")).toBeNull();
    const lookup = await client.stories.get("bbbbbbbbbbbbbbbb");
    expect(lookup.status).toBe("not_a_story");
    expect(lookup.article?.uid).toBe("bbbbbbbbbbbbbbbb");
  });

  it("pages materials oldest first and iterMaterials drains them", async () => {
    const last = {
      ...storyMaterials,
      results: storyMaterials.results.slice(0, 1),
      next_cursor: null,
    };
    const fetch = mockFetch((_url, _init, call) =>
      jsonResponse(call === 1 ? storyMaterials : last),
    );
    const client = makeClient(fetch);

    const first = await client.stories.materials(STORY_ID, { pageSize: 3 });
    expect(first.story_id).toBe(STORY_ID);
    expect(first.results).toHaveLength(3);
    expect(fetch.calls[0].url).toContain(`/api/stories/${STORY_ID}/materials/`);
    expect(first.results[0].time_published <= first.results[2].time_published).toBe(true);

    const fetch2 = mockFetch((_url, _init, call) =>
      jsonResponse(call === 1 ? storyMaterials : last),
    );
    const client2 = makeClient(fetch2);
    const uids: string[] = [];
    for await (const m of client2.stories.iterMaterials(STORY_ID, { pageSize: 3 }))
      uids.push(m.uid);
    expect(uids).toHaveLength(4);
  });

  it("maps 404 and the archive horizon 403 to typed errors", async () => {
    const client = makeClient(
      mockFetch((url) =>
        url.includes("/top/")
          ? jsonResponse(storiesTop)
          : url.includes("0000000000000000")
            ? jsonResponse({ message: "Story 0000000000000000 not found" }, { status: 404 })
            : jsonResponse(
                {
                  message: "Archive horizon exceeded.",
                  extra: { reason: "archive_horizon", tier: "free", archive_days: 30 },
                },
                { status: 403 },
              ),
      ),
    );

    await expect(client.stories.get("0000000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(client.stories.list({ cursor: "deep" })).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});
