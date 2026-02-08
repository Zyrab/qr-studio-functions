import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize the Admin SDK once
const app = initializeApp();
export const db = getFirestore(app);

// Export common helpers if needed
export { app };