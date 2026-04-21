// supabase/functions/create-payment-intent-ts/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Deploy:  supabase functions deploy create-payment-intent-ts --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_...
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Stripe API uses form-encoded bodies — this handles nested objects
function toFormEncoded(
  obj: Record<string, unknown>,
  prefix = ""
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(toFormEncoded(v as Record<string, unknown>, key));
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`
      );
    }
  }
  return parts.join("&");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Stripe secret key ───────────────────────────────────────────────
  const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY");
  if (!STRIPE_SECRET) {
    console.error("[awaz:payment] STRIPE_SECRET_KEY not set");
    return json(
      {
        error:
          "Stripe not configured — add STRIPE_SECRET_KEY via: supabase secrets set STRIPE_SECRET_KEY=sk_live_...",
      },
      500
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    amount,               // number — EUR amount (e.g. 50, 1000)
    type = "booking",     // "booking" | "boost" | "tip"
    artistStripeAccount,  // string | null — artist Connect acct_ (for bookings)
    platformAccountId,    // string | null — legacy/optional, ignored for boost
    bookingId,            // string — idempotency key
    customerEmail,        // string | null
    artistName,           // string
    platformFeePercent = 12, // number — 12 for booking, 100 for boost/tip
  } = body as {
    amount: number;
    type?: string;
    artistStripeAccount?: string | null;
    platformAccountId?: string | null;
    bookingId?: string;
    customerEmail?: string;
    artistName?: string;
    platformFeePercent?: number;
  };

  // ── Validate ────────────────────────────────────────────────────────
  if (!amount || typeof amount !== "number" || amount < 1) {
    return json({ error: "amount must be a positive number (EUR)" }, 400);
  }

  const amountCents = Math.round(amount * 100); // EUR → cents
  if (amountCents < 50) {
    return json({ error: "Minimum payment is €0.50" }, 400);
  }

  const isBoost = type === "boost" || type === "tip";

  // ── Build PaymentIntent params ──────────────────────────────────────
  const params: Record<string, unknown> = {
    amount: amountCents,
    currency: "eur",
    description: isBoost
      ? `Awaz Profile Boost — ${artistName || "Artist"}`
      : type === "tip"
      ? `Song Request Tip — ${artistName || "Artist"}`
      : `Booking deposit — ${artistName || "Artist"}`,
    metadata: {
      booking_id:    bookingId || "",
      artist_name:   artistName || "",
      customer_email:customerEmail || "",
      type,
      platform:      "awaz",
    },
    // Automatic payment methods — lets Stripe handle card, iDEAL, etc.
    automatic_payment_methods: { enabled: true },
  };

  if (customerEmail) {
    params.receipt_email = customerEmail;
  }

  // Idempotency key prevents duplicate charges on retry
  const idempotencyKey = `awaz_${type}_${bookingId || Date.now()}`;

  // For booking payments with a connected artist: use Stripe Connect transfer
  if (!isBoost && artistStripeAccount) {
    const feePercent = Math.min(Math.max(platformFeePercent as number, 0), 100);
    const applicationFee = Math.round(amountCents * feePercent / 100);
    params.application_fee_amount = applicationFee;
    params.transfer_data = { destination: artistStripeAccount };
  }

  // ── Call Stripe ─────────────────────────────────────────────────────
  console.log(`[awaz:payment] Creating PaymentIntent type=${type} amount=${amount}EUR`);

  const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: toFormEncoded(params),
  });

  const intent = await stripeRes.json();

  if (!stripeRes.ok || intent.error) {
    const errMsg = intent.error?.message || `Stripe error ${stripeRes.status}`;
    console.error("[awaz:payment] Stripe error:", errMsg, intent.error);
    return json({ error: errMsg }, 400);
  }

  console.log(
    `[awaz:payment] PaymentIntent created id=${intent.id} amount=${intent.amount}cents`
  );

  return json({
    clientSecret:    intent.client_secret,
    paymentIntentId: intent.id,
    amount:          intent.amount,
    currency:        intent.currency,
  });
});
