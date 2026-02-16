import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../utils/firebase";
import { User, QRCodeDocument, QRData } from "../utils/types";
import { randomBytes } from "crypto";



function generateSlug(length = 8): string {
  return randomBytes(Math.ceil(length * 3 / 4)).toString('base64url').slice(0, length).toLowerCase();
}


export const createQRCode = onCall( async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const userId = auth.uid;
  const { name, content, design, type, qrId } = request.data as (QRData & { qrId: string });

  if (!qrId) throw new HttpsError("invalid-argument", "Missing QR ID.");
  if (!name || !content || !design || !type) throw new HttpsError("invalid-argument", "Missing required QR code data.");

  const safeLogoRatio = Math.min(design.logoSizeRatio || 0.15, 0.25);

  if (design.logo && !design.logo.includes(`/users%2F${userId}%2F`)) throw new HttpsError("permission-denied", "Invalid logo source path.");

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) throw new HttpsError("not-found", "User profile not found.");
  const user = userDoc.data() as User;

  const isActivePaid = user.plan === "paid" && user.subscriptionStatus === "active";

  if (!isActivePaid) {
    const qrCountSnapshot = await db.collection("users").doc(userId).collection("qrcodes").count().get();
    const totalQRs = qrCountSnapshot.data().count;

    if (totalQRs >= user.qrLimit) throw new HttpsError("resource-exhausted", `Limit reached (${user.qrLimit}).`);

    if (type === "dynamic") {
      if (user.plan === "free" || (user.plan === "paid" && user.subscriptionStatus === "inactive")) {
        throw new HttpsError("permission-denied", "Dynamic QR codes require an active subscription.");
      }
      if (user.plan === "trial") {
        const dynamicSnapshot = await db.collection("users").doc(userId).collection("qrcodes").where("type", "==", "dynamic").count().get();
        if (dynamicSnapshot.data().count >= user.dynamicQrLimit) {
          throw new HttpsError("resource-exhausted", "Trial dynamic limit reached.");
        }
      }
    }
  }

  const batchSlug = type === "dynamic" ? generateSlug() : null;
  const now = Timestamp.now();
  
  let targetUrl = '';
  if (content.type === 'url') targetUrl = content.url;
  // Note: For Text or Wifi, you might redirect to a hosted landing page on your site
  // else targetUrl = `https://your-domain.com/view/${batchSlug}`;

  const newQrDoc: QRCodeDocument = {
    uid: userId,
    name,
    content,
    design: { ...design, logoSizeRatio: safeLogoRatio },
    type,
    slug: batchSlug,
    createdAt: now,
    updatedAt: now,
    trialEndsAt: (user.plan === "trial" && type === "dynamic") 
      ? Timestamp.fromMillis(now.toMillis() + (7 * 24 * 60 * 60 * 1000)) 
      : undefined
  };

  try {
    const userQrRef = db.collection("users").doc(userId).collection("qrcodes").doc(qrId);

    const docCheck = await userQrRef.get();
    if (docCheck.exists) throw new HttpsError("already-exists", "A QR code with this ID already exists.");
    const batch = db.batch();

    // Save main user document
    batch.set(userQrRef, newQrDoc);

    // If dynamic, setup redirection and initial stats
    if (type === "dynamic" && batchSlug) {
      const slugRef = db.collection("qrSlugs").doc(batchSlug);
      const statsRef = db.collection("qrStats").doc(batchSlug);

      batch.set(slugRef, {
        uid: userId,
        qrId: userQrRef.id,
        targetUrl: targetUrl,
        isActive: true,
        trialEndsAt: newQrDoc.trialEndsAt || null,
        scanCount: 0,
        type: "dynamic",
        createdAt: now
      });

      batch.set(statsRef, {
        scans: 0,
        lastScannedAt: null,
        countries: {},
        cities: {},
        os: {}
      });
    }

    await batch.commit();
    return { success: true, qrId: userQrRef.id, slug: batchSlug };
    
  } catch (error) {
    // If it was our specific error, rethrow it so the client sees the message
    if (error instanceof HttpsError) throw error;
    
    console.error("Batch write failed:", error);
    throw new HttpsError("internal", "Failed to save QR code and slug data.");
  }
});