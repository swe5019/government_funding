import { connection } from "next/server";
import { auth } from "@/auth";
import { plans, type Entitlements, type PlanKey } from "@/config/plans";
import { planFor } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";

export interface ViewerUser {
  id: string;
  email: string;
  name: string | null;
  acceptedDisclaimerAt: Date | null;
  trialUsedAt: Date | null;
  stripeCustomerId: string | null;
}

export interface Viewer {
  userId: string | null;
  user: ViewerUser | null;
  isAdmin: boolean;
  plan: PlanKey;
  entitlements: Entitlements;
  subscription: {
    status: string;
    interval: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null;
}

const ANONYMOUS: Viewer = {
  userId: null,
  user: null,
  isAdmin: false,
  plan: "free",
  entitlements: plans.free.entitlements,
  subscription: null,
};

/**
 * The current visitor: session user, plan and entitlements. Every page and data query goes
 * through this, so gating lives in one place. Reads the session, so call it inside <Suspense>.
 */
export async function getViewer(): Promise<Viewer> {
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return ANONYMOUS;
  const user = await prisma.user.findUnique({ where: { id }, include: { subscription: true } });
  if (!user) return ANONYMOUS;
  const plan = planFor(user.subscription);
  return {
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      acceptedDisclaimerAt: user.acceptedDisclaimerAt,
      trialUsedAt: user.trialUsedAt,
      stripeCustomerId: user.stripeCustomerId,
    },
    isAdmin: user.role === "ADMIN",
    plan,
    entitlements: plans[plan].entitlements,
    subscription: user.subscription
      ? {
          status: user.subscription.status,
          interval: user.subscription.interval,
          trialEndsAt: user.subscription.trialEndsAt,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
        }
      : null,
  };
}
