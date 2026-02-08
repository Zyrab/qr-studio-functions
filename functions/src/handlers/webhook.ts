import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { db } from "../utils/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { User } from "../utils/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-01-28.clover",
});

export const stripeWebhook = onRequest(
  {
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    maxInstances: 5,
  },
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      // Use req.rawBody for signature verification
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      console.error(`Webhook Signature Error: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const firebaseUID = session.metadata?.firebaseUID;

          if (firebaseUID) {
            // Subscription details are needed to get the initial period end
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            
            const userRef = db.collection("users").doc(firebaseUID);
            const updateData: Partial<User> & { updatedAt: Timestamp } = {
              plan: "paid",
              subscriptionStatus: "active",
              // Set paidUntil to the end of the current Stripe period
              paidUntil: Timestamp.fromMillis(subscription.current_period_end * 1000),
              qrLimit: 1000,
              dynamicQrLimit: 1000,
              updatedAt: Timestamp.now(),
            };

            await userRef.update(updateData);
          }
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const firebaseUID = subscription.metadata?.firebaseUID;

            if (firebaseUID) {
              const userRef = db.collection("users").doc(firebaseUID);
              await userRef.update({
                subscriptionStatus: "active",
                plan: "paid",
                // Extend access based on the new invoice period
                paidUntil: Timestamp.fromMillis(subscription.current_period_end * 1000),
              });
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUID = subscription.metadata?.firebaseUID;

          if (firebaseUID) {
            const userRef = db.collection("users").doc(firebaseUID);
            
            // Revert to free tier limits
            const updateData: Partial<User> = {
              plan: "free",
              subscriptionStatus: "inactive",
              paidUntil: null,
              qrLimit: 10,
              dynamicQrLimit: 0,
            };

            await userRef.update(updateData);
          }
          break;
        }

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook Processing Error:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);