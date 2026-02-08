import { onCall, HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { db } from "../utils/firebase";
import { User } from "../utils/types";

// Initialize Stripe with the secret key from environment variables
// Note: apiVersion 2026-01-28.clover is the latest stable release
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-01-28.clover",
});

/**
 * Creates a Stripe Checkout Session for a subscription.
 * Handles customer creation if it doesn't exist.
 */
export const createCheckoutSession = onCall(
  {
    enforceAppCheck: false, // Set to true in production
    secrets: ["STRIPE_SECRET_KEY"], // Recommended: Use Cloud Secret Manager
  },
  async (request) => {
    const { auth } = request;

    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const uid = auth.uid;
    const userRef = db.collection("users").doc(uid);

    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User document not found.");
      }

      const userData = userDoc.data() as User;
      let customerId = userData.stripeCustomerId;

      // 1. Create Stripe Customer if one doesn't exist in Firestore
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userData.email,
          metadata: { firebaseUID: uid },
        });
        customerId = customer.id;
        
        // Save back to Firestore immediately
        await userRef.update({ stripeCustomerId: customerId });
      }

      // 2. Define Checkout Session Parameters
      // mode: "subscription" is required for recurring plans
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID_EUR, // Ensure this env var is set
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`,
        // Allow promotional codes (coupons) if desired
        allow_promotion_codes: true,
        // Automatically pre-fill customer's email
        customer_update: { address: 'auto' },
        metadata: { firebaseUID: uid }
      });

      return { url: session.url };
    } catch (error: any) {
      console.error("Stripe Checkout Error:", error);
      throw new HttpsError("internal", error.message || "Unable to create checkout session.");
    }
  }
);