/**
 * First-touch acquisition capture. On the FIRST visit we snapshot utm_* params,
 * ?ref= (referral code) and the landing path into localStorage; signup and
 * checkout attach it so revenue is attributable to a channel. First-touch by
 * design: later visits never overwrite (the channel that FOUND the customer
 * gets the credit).
 */

const KEY = "refx.attribution";
const REF_KEY = "refx.ref";

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  ref?: string;
  landing?: string;
  referrer?: string;
}

/** Call on every page load (Providers); only the first visit writes. */
export function captureFirstTouch(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    // The referral code is stored separately and MAY refresh (a newer friend's
    // link should win — that's who actually convinced them).
    if (ref) localStorage.setItem(REF_KEY, ref.toUpperCase().slice(0, 32));

    if (localStorage.getItem(KEY)) return; // first-touch already captured
    const attribution: Attribution = {};
    const utm = (k: string) => params.get(`utm_${k}`)?.trim() || undefined;
    attribution.source = utm("source");
    attribution.medium = utm("medium");
    attribution.campaign = utm("campaign");
    attribution.term = utm("term");
    attribution.content = utm("content");
    if (ref) attribution.ref = ref;
    attribution.landing = window.location.pathname.slice(0, 200);
    if (document.referrer && !document.referrer.includes(window.location.host)) {
      attribution.referrer = document.referrer.slice(0, 200);
    }
    // Only persist when there's actual signal (organic direct visits stay null).
    const hasSignal = Object.entries(attribution).some(
      ([k, v]) => k !== "landing" && v,
    );
    if (hasSignal) localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    /* storage unavailable (private mode) — attribution is best-effort */
  }
}

/** The stored first-touch data (undefined when the visit was organic/direct). */
export function getAttribution(): Attribution | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : undefined;
  } catch {
    return undefined;
  }
}

/** The most recent referral code seen (?ref=...). */
export function getReferralCode(): string | undefined {
  try {
    return localStorage.getItem(REF_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
