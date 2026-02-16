import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Global Options for all v2 functions.
 * - region: Updated to 'europe-west3' to match your Firestore database location.
 * - maxInstances: Set to 10 to control costs and prevent over-scaling.
 */
setGlobalOptions({region: "europe-west3", maxInstances: 10 });

// Import the trial handler
import { handleTrialStart } from "./handlers/trials";
import { createCheckoutSession } from "./handlers/subscriptions";
import { getCustomerPortalLink } from "./handlers/portal";
import { stripeWebhook } from "./handlers/webhook";
import { createUser } from "./handlers/create-user";
import { createQRCode } from "./handlers/create-qr-code";
import { redirectQR } from "./handlers/redirect-qr-code";
// Export the functions
export { handleTrialStart, createCheckoutSession, getCustomerPortalLink, stripeWebhook, createUser, createQRCode, redirectQR };