import { describe, it, expect } from "vitest";
import { scrubSensitiveKeywords } from "./aiDumpService";

describe("scrubSensitiveKeywords", () => {
  it("should replace Authorization with AUTH_HEADER_REDACTED", () => {
    const input = 'headers: { Authorization: "Token abc123" }';
    const output = scrubSensitiveKeywords(input);
    expect(output).toContain("AUTH_HEADER_REDACTED");
    expect(output).not.toContain("Authorization");
  });

  it("should replace Bearer prefix with BEARER_REDACTED", () => {
    const input = "Bearer eyJhbGciOiJIUzI1NiJ9";
    const output = scrubSensitiveKeywords(input);
    expect(output).toContain("BEARER_REDACTED ");
    expect(output).not.toMatch(/Bearer\s/i);
  });

  it("should replace Token prefix with TOKEN_REDACTED", () => {
    const input = "Token abc123xyz";
    const output = scrubSensitiveKeywords(input);
    expect(output).toContain("TOKEN_REDACTED ");
    expect(output).not.toMatch(/Token\s/i);
  });

  it("should handle combined Authorization: Token pattern", () => {
    const input = "Authorization: Token abc";
    const output = scrubSensitiveKeywords(input);
    expect(output).toBe("AUTH_HEADER_REDACTED: TOKEN_REDACTED abc");
  });

  it("should be case-insensitive", () => {
    const input = "AUTHORIZATION: bearer xyz";
    const output = scrubSensitiveKeywords(input);
    expect(output).toBe("AUTH_HEADER_REDACTED: BEARER_REDACTED xyz");
  });

  it("should handle multiple occurrences", () => {
    const input = `
      const resp1 = fetch(url, { headers: { Authorization: "Bearer abc" } });
      const resp2 = fetch(url, { headers: { authorization: "Token xyz" } });
    `;
    const output = scrubSensitiveKeywords(input);
    expect(output).not.toContain("Authorization");
    expect(output).not.toContain("authorization");
    expect(output.match(/AUTH_HEADER_REDACTED/g)?.length).toBe(2);
  });
});
