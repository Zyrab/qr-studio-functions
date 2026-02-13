import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import { Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";


/**
 * HELPER: Safely extract an ID.
 * Based on your schema, some fields are strings (IDs) and some are objects.
 */
const safeId = (field: any): string | null => {
  if (!field) return null;
  return typeof field === "string" ? field : field.id;
};

/**
 * HELPER: Get end date from a Subscription Object.
 * SOURCE OF TRUTH: Your schema shows 'current_period_end' is inside 'items.data',
 * not at the root of the subscription object.
 */
const getSubscriptionEnd = (subscription: any): number => {
  if (subscription.items && subscription.items.data && subscription.items.data.length > 0) {
    return subscription.items.data[0].current_period_end;
  }
  console.warn("⚠️ No items found in subscription. Defaulting to 30 days.");
  return Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
};

export const stripeWebhook = onRequest({ secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]}, async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
      res.status(400).send("Missing stripe-signature header");
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2026-01-28.clover" });

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      console.error("❌ Signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const uid = session.metadata?.firebaseUID;
          
          const subscriptionId = safeId(session.subscription);
          const customerId = safeId(session.customer);

          if (!uid) { console.error("❌ No firebaseUID in session metadata"); break;}
          if (!subscriptionId) { console.error("❌ No subscription ID found in session"); break; }

          // We must fetch the subscription here because the Session object 
          // doesn't contain the 'items' array needed for the date.
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          
          const expiresAt = getSubscriptionEnd(subscription);

          await db.collection("users").doc(uid).update({
            plan: "paid",
            subscriptionStatus: "active",
            stripeCustomerId: customerId,
            trialUsed: true, 
            paidUntil: Timestamp.fromMillis(expiresAt * 1000),
            qrLimit: 1000, 
            dynamicQrLimit: 500,
          });

          console.log(`✅ User ${uid} upgraded to PRO. Ends: ${expiresAt}`);
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object
          
          if (invoice.billing_reason === 'subscription_create') break; 
        
          const customerId = safeId(invoice.customer);

          if (!customerId) { console.error("❌ Missing customer ID in invoice"); break;}

          let expiresAt = 0;
          
          if (invoice.lines && invoice.lines.data && invoice.lines.data.length > 0) {
            expiresAt = invoice.lines.data[0].period.end;
          } else {
            expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
          }

          console.log(`Processing Invoice for Customer: ${customerId}`);

          // Find the user by their Stripe ID
          const usersRef = db.collection("users");
          const snapshot = await usersRef.where("stripeCustomerId", "==", customerId).limit(1).get();

          if (snapshot.empty) { console.error("❌ No user found for Stripe Customer:", customerId); break; }

          const docId = snapshot.docs[0].id;

          await db.collection("users").doc(docId).update({
            plan: "paid",
            subscriptionStatus: "active",
            paidUntil: Timestamp.fromMillis(expiresAt * 1000),
          });

          console.log(`✅ User ${docId} renewed until: ${expiresAt}`);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const customerId = safeId(subscription.customer);

          if (!customerId) { console.error("❌ No customer ID in deleted subscription"); break; }

          const usersRef = db.collection("users");
          const snapshot = await usersRef.where("stripeCustomerId", "==", customerId).limit(1).get();

          if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            await db.collection("users").doc(docId).update({
              plan: "free",
              subscriptionStatus: "inactive",
              paidUntil: null,
              qrLimit: 10,
              dynamicQrLimit: 0
            });
            console.log(`User ${docId} downgraded`);
          }
          break;
        }
      }
    } catch (error: any) {
      console.error("Processing Error:", error);
      res.json({ received: true, error: error.message }); 
      return;
    }

    res.json({ received: true });
  }
);