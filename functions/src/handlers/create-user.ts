import * as functions from 'firebase-functions/v1';
import { Timestamp } from 'firebase-admin/firestore';
import { User } from "../utils/types";
import { db } from "../utils/firebase";


export const createUser = functions.region('europe-west3').auth.user().onCreate(async (user) => {
    const userId = user.uid;
    const userRef = db.collection("users").doc(userId);

    const userData: User = {
      email: user.email || "",
      plan: "free",
      subscriptionStatus: "inactive",
      stripeCustomerId: null,
      qrLimit: 10,
      dynamicQrLimit: 0,
      trialUsed: false,
      trialStartedAt: null,
      trialEndsAt: null,
      paidUntil: null,
      createdAt: Timestamp.now(),
    };

    try {
      await userRef.set(userData, { merge: true });
      
      console.log(`[Success]: Created user entry for UID: ${userId}`);
      return { success: true, uid: userId };
    } catch (error) {
      console.error(`[Error]: Failed to create user entry for UID: ${userId}`, error);
      throw new functions.https.HttpsError('internal', 'Failed to create user doc');
    }
  });