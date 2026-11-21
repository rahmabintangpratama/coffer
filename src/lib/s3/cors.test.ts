// @vitest-environment node
import { describe, expect, it } from "vitest";
import { corsJson, corsRule, corsXml } from "./cors";

const ORIGIN = "https://coffer.pages.dev";

describe("CORS rule", () => {
  it("allows exactly one origin, the methods Coffer uses and any header", () => {
    expect(corsRule(ORIGIN)).toMatchObject({
      AllowedOrigins: [ORIGIN],
      AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
      AllowedHeaders: ["*"],
    });
  });

  it("exposes ETag (multipart), Date (clock skew) and the bucket region", () => {
    expect(corsRule(ORIGIN).ExposeHeaders).toEqual(expect.arrayContaining(["ETag", "Date", "x-amz-bucket-region"]));
  });

  it.each(["*", "https://app.example.com/path", "app.example.com", "https://app.example.com/", ""])(
    "refuses the origin %j",
    (origin) => {
      expect(() => corsRule(origin)).toThrow();
    },
  );

  it("accepts a local origin with a port", () => {
    expect(corsRule("http://localhost:5173").AllowedOrigins).toEqual(["http://localhost:5173"]);
  });

  it("renders the same rule as JSON and XML", () => {
    const json = JSON.parse(corsJson(ORIGIN)) as unknown[];
    expect(json).toEqual([corsRule(ORIGIN)]);
    const xml = corsXml(ORIGIN);
    expect(xml).toContain(`<AllowedOrigin>${ORIGIN}</AllowedOrigin>`);
    expect(xml).toContain("<ExposeHeader>ETag</ExposeHeader>");
    expect(xml).toContain("<AllowedHeader>*</AllowedHeader>");
    expect(xml.startsWith("<CORSConfiguration>")).toBe(true);
  });

  it("escapes XML characters that appear in the origin", () => {
    expect(corsXml("https://a.example.com&x")).toContain("<AllowedOrigin>https://a.example.com&amp;x</AllowedOrigin>");
  });
});
