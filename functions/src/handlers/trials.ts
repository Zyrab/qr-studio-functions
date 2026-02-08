import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../utils/firebase";
import { User } from "../utils/types";

/**
 * Handles the logic for starting a 7-day free trial.
 * Updates the user document based on the finalized User type.
 */
export const handleTrialStart = onCall({ enforceAppCheck: false }, async (request) => {
    const { auth } = request;

    if (!auth) throw new HttpsError("unauthenticated", "User must be logged in.");

    const uid = auth.uid;
    const userRef = db.collection("users").doc(uid);

    try {
      return await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) throw new HttpsError("not-found", "User document not found.");

        const userData = userDoc.data() as User;

        // Can't start a trial if already paid or if trial was already used
        if (userData.plan === "paid" || userData.trialUsed) {
          throw new HttpsError( "failed-precondition", "User is not eligible for a trial.");
        }

        const now = Timestamp.now();
        const trialDurationMs = 7 * 24 * 60 * 60 * 1000;
        const trialEndsAt = Timestamp.fromMillis(now.toMillis() + trialDurationMs);

        const updateData: Partial<User> = {
          plan: "trial",
          subscriptionStatus: "trialing",
          trialUsed: true,
          trialStartedAt: now,
          trialEndsAt: trialEndsAt,
          dynamicQrLimit: 1,
          qrLimit: userData.qrLimit || 10, 
        };

        transaction.update(userRef, updateData);

        return {
          success: true,
          trialEndsAt: trialEndsAt.toDate().toISOString(),
          plan: "trial"
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;   
      console.error("Trial Start Error:", error);
      throw new HttpsError("internal", "An error occurred while activating the trial.");
    }
  }
);