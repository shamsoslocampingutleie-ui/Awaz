import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { artistId, artistEmail, artistName, returnUrl } = await req.json();

    if (!artistId || !artistName) {
      return new Response(
        JSON.stringify({ error: "Missing artistId or artistName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let accountId: string;
    const existing = await stripe.accounts.list({ limit: 100 });
    const found = existing.data.find(
      (acc) => acc.metadata?.awaz_artist_id === artistId
    );

    if (found) {
      accountId = found.id;
    } else {
      const account = await stripe.accounts.create({
        type: "express",
        country: "NO",
        email: artistEmail || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        business_profile: {
          name: artistName,
          url: "https://awaz.no",
          mcc: "7929",
        },
        metadata: {
          awaz_artist_id: artistId,
          awaz_artist_name: artistName,
        },
        settings: {
          payouts: {
            schedule: {
              interval: "weekly",
              weekly_anchor: "monday",
            },
          },
        },
      });
      accountId = account.id;
    }

    const origin = returnUrl ? new URL(returnUrl).origin : "https://awaz.no";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/?stripe=refresh`,
      return_url: returnUrl || `${origin}/?stripe=success`,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
    });

    return new Response(
      JSON.stringify({ accountId, url: accountLink.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("stripe-connect-onboard error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
