import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/auth/admins";
import { MAGIC_LINK_MAX_AGE_S, tooManyLinks } from "@/lib/auth/throttle";
import { sendEmail } from "@/lib/email/send";
import { magicLinkEmail } from "@/lib/email/templates";

/** Set by the sign-in form when the user ticks "not investment advice"; consumed on account creation. */
export const DISCLAIMER_COOKIE = "ff_disclaimer_ack";

/** Google sign-in is offered only when its OAuth client is configured. */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The adapter's types target @prisma/client; our client is generated to src/generated (Prisma 7).
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" },
  providers: [
    ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: false })] : []),
    Resend({
      // Unused when sendVerificationRequest is overridden, but required by the provider.
      apiKey: process.env.RESEND_API_KEY ?? "dev",
      from: process.env.EMAIL_FROM ?? "dev@localhost",
      maxAge: MAGIC_LINK_MAX_AGE_S,
      async sendVerificationRequest({ identifier, url }) {
        const live = await prisma.verificationToken.count({ where: { identifier, expires: { gt: new Date() } } });
        if (tooManyLinks(live)) throw new Error("Too many sign-in links requested. Try again in 15 minutes.");
        await sendEmail(magicLinkEmail(identifier, url));
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      const ack = (await cookies()).get(DISCLAIMER_COOKIE)?.value === "1";
      if (ack) await prisma.user.update({ where: { id: user.id }, data: { acceptedDisclaimerAt: new Date() } });
    },
    async signIn({ user }) {
      // Keep the ADMIN role in sync with ADMIN_EMAILS on every sign-in (granting and revoking).
      if (!user.id || !user.email) return;
      const role = isAdminEmail(user.email) ? "ADMIN" : "USER";
      await prisma.user.updateMany({ where: { id: user.id, NOT: { role } }, data: { role } });
    },
  },
});
