import { Timestamp } from "firebase-admin/firestore";

export type User = {
  email: string;
  plan: "free" | "trial" | "paid";
  subscriptionStatus: "inactive" | "trialing" | "active";
  stripeCustomerId: string | null;
  qrLimit: number;
  dynamicQrLimit: number;
  trialUsed: boolean;
  trialStartedAt: Timestamp | null;
  trialEndsAt: Timestamp | null;
  paidUntil: Timestamp | null;
  createdAt: Timestamp;
};