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

type DotType = string;
type EyeType = string;

type UrlContent = { type: 'url'; url: string };
type TextContent = { type: 'text'; text: string };
type WifiContent = { type: 'wifi'; ssid: string; password: string };

export type QRContent = UrlContent | TextContent | WifiContent;

export interface QRDesign {
  dotType: DotType;
  eyeFrame?: EyeType;
  eyeBall?: EyeType;
  bodyColor?: string;
  eyeColor?: string;
  bgColor?: string;
  logo?: string | null; 
  logoStyle?: 'square' | 'circle';
  logoSizeRatio?: number;
}

export interface QRData {
  name: string;
  content: QRContent;
  design: QRDesign;
  type: "static" | "dynamic"
}

export interface QRCodeDocument extends QRData {
  slug: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  trialEndsAt: Timestamp | null; 
}
