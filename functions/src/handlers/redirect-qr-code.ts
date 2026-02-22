import { onRequest } from "firebase-functions/v2/https";
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from "../utils/firebase";

export const redirectQR = onRequest( async (req, res) => {
  const slug = req.path.replace(/^\/+/, '').toLowerCase().trim();

  if (!slug) {    
    res.redirect(302, 'https://atqr.app');
    return;
  }

  const isValidSlug = /^[a-z0-9_-]+$/.test(slug);
  
  if (!isValidSlug || slug.length > 15) {
    res.redirect(302, 'https://atqr.app');
    return;
  }

  try {
    const slugRef = db.collection("qrSlugs").doc(slug);
    const slugSnap = await slugRef.get();

    if (!slugSnap.exists) {
      res.redirect(302, 'https://atqr.app');
      return;
    }

    const qr = slugSnap.data() as any;
    const now = Timestamp.now();

    if (qr.isActive === false) {
      res.status(403).send("This QR code is inactive.");
      return;
    }

   if (qr.trialEndsAt && qr.trialEndsAt.toMillis() < now.toMillis()) {
      const userRef = db.collection('users').doc(qr.uid);
      await Promise.all([
        slugRef.update({ isActive: false }),
        userRef.update({ 
          plan: "free",
          subscriptionStatus: "inactive",
          dynamicQrLimit: 0,
          trialUsed: true,
        })
      ]);

      // 3. Then send the response
      res.status(403).send("The trial for this dynamic QR code has expired.");
      return;
    }

    const sanitize = (val: string) => val.replace(/\./g, '_');

    
    const country = sanitize((req.headers['x-country-code'] || 'unknown').toString());
    // const city = sanitize((req.headers['x-appengine-city'] || 'unknown').toString());
    const userAgent = req.get('user-agent') || '';
    
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
      [`os.${os}`]: FieldValue.increment(1)    
    };

    statsRef.update(updateData).catch(e => {
      console.error(`[Stats Error] for slug ${slug}:`, e);
    });

    
    const targetUrl = qr.targetUrl || 'https://atqr.app';
    
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.redirect(302, targetUrl);

    
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});