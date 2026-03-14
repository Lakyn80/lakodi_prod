import assert from "node:assert/strict";
import test from "node:test";

const CANONICAL_HOST = "https://lakodi.cz";
const BASE_URL = process.env.SEO_BASE_URL ?? "http://127.0.0.1:3210";
const DYNAMIC_PATH = process.env.SEO_DYNAMIC_PATH ?? "/sluzby/prevodovky";

function absoluteUrl(path: string) {
  return new URL(path, BASE_URL).toString();
}

function normalizeCanonical(url: string): string {
  if (url === CANONICAL_HOST || url === `${CANONICAL_HOST}/`) {
    return `${CANONICAL_HOST}/`;
  }
  if (url.endsWith("/")) {
    return url.slice(0, -1);
  }
  return url;
}

function extractCanonical(html: string): string {
  const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  assert.ok(match?.[1], "Missing canonical link");
  return match[1];
}

async function fetchHtml(path: string): Promise<string> {
  const response = await fetch(absoluteUrl(path), { redirect: "follow" });
  assert.equal(response.status, 200, `Expected 200 for ${path}, got ${response.status}`);
  return response.text();
}

test("Homepage has canonical https://lakodi.cz/", async () => {
  const html = await fetchHtml("/");
  const canonical = extractCanonical(html);
  assert.equal(normalizeCanonical(canonical), `${CANONICAL_HOST}/`);
  assert.ok(canonical.startsWith(CANONICAL_HOST));
  assert.ok(!html.includes("localhost"));
  assert.ok(!html.includes("www.lakodi.cz"));
});

test("Dynamic service page has self canonical and not homepage fallback", async () => {
  const html = await fetchHtml(DYNAMIC_PATH);
  const canonical = extractCanonical(html);
  const expectedCanonical = `${CANONICAL_HOST}${DYNAMIC_PATH}`;

  assert.equal(normalizeCanonical(canonical), normalizeCanonical(expectedCanonical));
  assert.ok(canonical.startsWith(CANONICAL_HOST));
  assert.notEqual(normalizeCanonical(canonical), `${CANONICAL_HOST}/`);
  assert.ok(!html.includes("localhost"));
  assert.ok(!html.includes("www.lakodi.cz"));
});
