import { onRequest } from "firebase-functions/v2/https";
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from "../utils/firebase";


export const redirectQR = onRequest( async (req, res) => {
  const slug = req.path.replace(/^\/+/, '').toLowerCase().trim();

  if (!slug) {
    res.status(400).send("Invalid QR code identifier.");
    return;
  }

  try {
    const slugRef = db.collection("qrSlugs").doc(slug);
    const slugSnap = await slugRef.get();

    if (!slugSnap.exists) {
      res.status(404).send("QR code not found.");
      return;
    }

    const qr = slugSnap.data() as any;
    const now = Timestamp.now();

    // 2. Status & Expiration Checks
    if (qr.isActive === false) {
      res.status(403).send("This QR code is inactive.");
      return;
    }

    if (qr.trialEndsAt && qr.trialEndsAt.toMillis() < now.toMillis()) {
      await slugRef.update({ isActive: false });
      res.status(403).send("The trial for this dynamic QR code has expired.");
      return;
    }

    // 3. Stats Aggregation Logic
    // Sanitize values to prevent Firestore path errors (dots are not allowed in field names)
    const sanitize = (val: string) => val.replace(/\./g, '_');
    
    const country = sanitize((req.headers['x-vias-is-country-code'] || 'unknown').toString());
    const city = sanitize((req.headers['x-vias-is-city'] || 'unknown').toString());
    const userAgent = req.get('user-agent') || '';
    
    // Detect OS
    let os = 'Other';
    if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
    else if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Macintosh')) os = 'MacOS';
    else if (userAgent.includes('Linux')) os = 'Linux';

    const statsRef = db.collection('qrStats').doc(slug);

    const updateData: Record<string, any> = {
      scans: FieldValue.increment(1),
      lastScannedAt: now,
      [`countries.${country}`]: FieldValue.increment(1),
      [`cities.${country}.${city}`]: FieldValue.increment(1),
      [`os.${os}`]: FieldValue.increment(1)
    };

    statsRef.set(updateData, { merge: true }).catch(e => {
      console.error(`[Stats Error] for slug ${slug}:`, e);
    });

    const targetUrl = qr.targetUrl || 'https://atqr.app';
    
    // Disable caching so every scan hits our server
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.redirect(302, targetUrl);

  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});