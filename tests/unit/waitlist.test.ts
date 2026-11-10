import { describe, expect, it } from "vitest";
import { waitlistInput } from "@/lib/waitlist";

describe("waitlist input", () => {
  it("normalizes email and accepts known price answers", () => {
    expect(waitlistInput.parse({ email: "  Me@Example.COM ", priceAnswer: "19", source: "feature:screener", userId: null })).toEqual({
      email: "me@example.com",
      priceAnswer: "19",
      source: "feature:screener",
      userId: null,
    });
  });

  it("rejects bad emails, unknown prices and odd sources", () => {
    expect(waitlistInput.safeParse({ email: "nope", priceAnswer: null, source: null, userId: null }).success).toBe(false);
    expect(waitlistInput.safeParse({ email: "a@b.co", priceAnswer: "5", source: null, userId: null }).success).toBe(false);
    expect(waitlistInput.safeParse({ email: "a@b.co", priceAnswer: null, source: "<script>", userId: null }).success).toBe(false);
  });
});
