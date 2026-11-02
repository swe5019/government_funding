import { prisma } from "@/lib/db";

/**
 * Permanently delete a user and their personal data: sessions, linked sign-in accounts,
 * subscription record, watchlists and alert history (cascades), plus pending sign-in links.
 * Admin review history and audit entries are kept for data integrity but detached from the
 * person (reviewer set to null). Billing records stay in Stripe (see deleteAccountAction).
 */
export async function deleteUserData(userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return false;
    await tx.tickerMatch.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } });
    await tx.auditLog.updateMany({ where: { userId }, data: { userId: null } });
    await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
    await tx.user.delete({ where: { id: userId } });
    return true;
  });
}

/** What the user must type to confirm. */
export const DELETE_CONFIRMATION = "DELETE";
