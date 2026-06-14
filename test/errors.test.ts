import { describe, expect, it } from "vitest";
import {
  type AlphaAIAPIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from "../src";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected the promise to reject");
}

describe("error mapping", () => {
  it("maps 401 with a `detail` body (host gate)", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ detail: "API key required." }, { status: 401 })),
    );
    const err = (await captureError(client.news.list())) as AuthenticationError;

    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe("API key required.");
    expect(err.status).toBe(401);
  });

  it("maps 401 with a `message` body (app layer)", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ message: "Invalid API key.", extra: {} }, { status: 401 })),
    );
    const err = (await captureError(client.news.list())) as AuthenticationError;

    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe("Invalid API key.");
  });

  it("exposes validation fields on a 400", async () => {
    const client = makeClient(
      mockFetch(() =>
        jsonResponse(
          { message: "Invalid input.", extra: { fields: { min_relevance: ["Must be 1–10."] } } },
          { status: 400 },
        ),
      ),
    );
    const err = (await captureError(client.news.list())) as BadRequestError;

    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.fields).toEqual({ min_relevance: ["Must be 1–10."] });
  });

  it("maps 404", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ message: "Not found." }, { status: 404 })),
    );
    const err = (await captureError(client.symbols.get("AAPL"))) as NotFoundError;

    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(404);
  });

  it("maps 429 and surfaces retryAfter and limit headers", async () => {
    const client = makeClient(
      mockFetch(() =>
        jsonResponse(
          { message: "Rate limit exceeded." },
          {
            status: 429,
            headers: {
              "retry-after": "12",
              "x-ratelimit-limit": "100",
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "1700000000",
            },
          },
        ),
      ),
    );
    const err = (await captureError(client.news.trending())) as RateLimitError;

    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(12);
    expect(err.limit).toBe(100);
    expect(err.remaining).toBe(0);
    expect(err.reset).toBe(1700000000);
  });

  it("maps 5xx", async () => {
    const client = makeClient(mockFetch(() => jsonResponse({ message: "Boom." }, { status: 503 })));
    const err = (await captureError(client.news.trending())) as ServerError;

    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(503);
  });

  it("falls back to the raw body for non-JSON errors", async () => {
    const client = makeClient(mockFetch(() => new Response("upstream exploded", { status: 500 })));
    const err = (await captureError(client.news.trending())) as AlphaAIAPIError;

    expect(err).toBeInstanceOf(ServerError);
    expect(err.message).toContain("upstream exploded");
    expect(err.body).toBe("upstream exploded");
  });
});
