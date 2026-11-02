/** Seeded by seed.ts; specs sign in by setting the Auth.js database-session cookie. */
export const E2E_USERS = {
  free: { id: "e2e_free", email: "free@e2e.test", role: "USER", pro: false, sessionToken: "e2e-session-free" },
  pro: { id: "e2e_pro", email: "pro@e2e.test", role: "USER", pro: true, sessionToken: "e2e-session-pro" },
  admin: { id: "e2e_admin", email: "admin@e2e.test", role: "ADMIN", pro: false, sessionToken: "e2e-session-admin" },
  /** Deleted by the account-deletion spec. */
  leaving: { id: "e2e_leaving", email: "leaving@e2e.test", role: "USER", pro: false, sessionToken: "e2e-session-leaving" },
} as const;

export type E2EUser = keyof typeof E2E_USERS;
