import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { E2E_USERS, type E2EUser } from "./users";

export { expect };

export const test = base.extend<{ signInAs: (user: E2EUser) => Promise<void> }>({
  signInAs: async ({ context, baseURL }, provide) => {
    await provide(async (user) => {
      await context.addCookies([
        { name: "authjs.session-token", value: E2E_USERS[user].sessionToken, url: baseURL!, httpOnly: true, sameSite: "Lax" },
      ]);
    });
  },
});

/** Fails on serious or critical WCAG A/AA violations. */
export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
}
