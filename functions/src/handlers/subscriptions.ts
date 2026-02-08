import { onCall, HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { db } from "../utils/firebase";
import { User } from "../utils/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2026-01-28.clover" });


export const createCheckoutSession = onCall(
  {
    enforceAppCheck: false,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  async (request) => {
    const { auth } = request;
    if (!auth) throw new HttpsError("unauthenticated", "User must be logged in.");

    const uid = auth.uid;
    const userRef = db.collection("users").doc(uid);

    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) throw new HttpsError("not-found", "User not found.");

      const userData = userDoc.data() as User;
      let customerId = userData.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userData.email,
          metadata: { firebaseUID: uid },
        });
        customerId = customer.id;
        await userRef.update({ stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: process.env.STRIPE_PRICE_ID_EUR, quantity: 1 }],
        mode: "subscription",
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`,
        metadata: { firebaseUID: uid }
      });

      return { url: session.url };
    } catch (error: any) {
      console.error("Checkout Session Error:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);