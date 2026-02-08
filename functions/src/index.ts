import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Global Options for all v2 functions.
 * - region: Updated to 'europe-west3' to match your Firestore database location.
 * - maxInstances: Set to 10 to control costs and prevent over-scaling.
 */
setGlobalOptions({ 
  region: "europe-west3", 
  maxInstances: 10 
});

// Import the trial handler
import { handleTrialStart } from "./handlers/trials";

// Export the functions
export { handleTrialStart };