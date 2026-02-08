import { onCall, HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { db } from "../utils/firebase";
import { User } from "../utils/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2026-01-28.clover" });

/**
 * Generates a Stripe Billing Portal link for the user to manage 
 * their subscription, payment methods, and invoices.
 */
export const getCustomerPortalLink = onCall({ enforceAppCheck: false, secrets: ["STRIPE_SECRET_KEY"] }, async (request) => {
    const { auth } = request;
    
    if (!auth) throw new HttpsError("unauthenticated", "User must be logged in.");

    const uid = auth.uid;
    const userRef = db.collection("users").doc(uid);

    try {
      const userSnap = await userRef.get();

      if (!userSnap.exists) throw new HttpsError("not-found", "User document not found.");

      const userData = userSnap.data() as User;

      if (!userData.stripeCustomerId) {
        throw new HttpsError(
          "failed-precondition",
          "You do not have an active billing profile. Please subscribe first."
        );
      }

      // Create the portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: userData.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/dashboard`,
      });

      return { url: portalSession.url };
    } catch (error: any) {
      console.error("Portal Session Error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "An error occurred while creating the billing portal session.");
    }
  }
);