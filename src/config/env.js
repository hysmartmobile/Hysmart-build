
import "dotenv/config";
import { z } from "zod";

const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const isLocalUrl = (value) => {
  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "");

    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.")
    );
  } catch {
    return false;
  }
};

// Empty optional secrets are treated as unconfigured.
// Never use fake credentials to bypass production validation.
const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === ""
      ? undefined
      : value,
  z.string().min(1).optional()
);

const configuredWebAppUrl =
  process.env.WEB_APP_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    PORT: z.coerce.number().int().positive().default(3001),

    TRUST_PROXY: z.preprocess((value) => {
      if (value === undefined || value === null || value === "") {
        return false;
      }

      if (typeof value === "boolean") {
        return value;
      }

      return String(value).trim().toLowerCase() === "true";
    }, z.boolean()),

    API_PREFIX: z.string().default("/api/v1"),

    CORS_ORIGIN: z
      .string()
      .default("http://localhost:5173"),

    SUPABASE_URL: z.string().url(),

    SUPABASE_ANON_KEY: z.string().min(1),

    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    PAYSTACK_SECRET_KEY: optionalSecret,

    FLW_SECRET_KEY: optionalSecret,

    FLW_SECRET_HASH: optionalSecret,

    STRIPE_SECRET_KEY: optionalSecret,

    STRIPE_WEBHOOK_SECRET: optionalSecret,

    CUSTOMER_CARE_LOCAL_MODEL_URL: z
      .string()
      .url()
      .default("http://127.0.0.1:11434"),

    CUSTOMER_CARE_LOCAL_MODEL_NAME: z
      .string()
      .min(1)
      .default("qwen2.5:7b"),

    HYSMART_PROJECT_AI_ENABLED: z.preprocess(
      (value) =>
        value === true ||
        String(value ?? "").trim().toLowerCase() === "true",
      z.boolean()
    ).default(false),

    BILLING_CALLBACK_URL: z
      .string()
      .url()
      .default("http://localhost:5173/billing/callback"),

    WEB_APP_URL: z.string().url().default(configuredWebAppUrl),
  })
  .superRefine((value, ctx) => {
    const production = value.NODE_ENV === "production";

    const addIssue = (path, message) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message,
      });
    };

    // API configuration.
    if (
      !value.API_PREFIX.startsWith("/") ||
      value.API_PREFIX.startsWith("//")
    ) {
      addIssue(
        "API_PREFIX",
        "API_PREFIX must start with one '/' and must not start with '//'"
      );
    }

    // Validate every configured CORS origin.
    const origins = value.CORS_ORIGIN
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      addIssue("CORS_ORIGIN", "At least one CORS origin is required");
    }

    for (const origin of origins) {
      let parsedOrigin;

      try {
        parsedOrigin = new URL(origin);
      } catch {
        addIssue("CORS_ORIGIN", `Invalid CORS origin: ${origin}`);
        continue;
      }

      if (
        parsedOrigin.protocol !== "http:" &&
        parsedOrigin.protocol !== "https:"
      ) {
        addIssue(
          "CORS_ORIGIN",
          `CORS origin must use HTTP or HTTPS: ${origin}`
        );
      }

      // CORS entries must be origins, not URLs with paths,
      // query strings, fragments, or credentials.
      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (
        parsedOrigin.origin !== normalizedOrigin ||
        parsedOrigin.username ||
        parsedOrigin.password
      ) {
        addIssue(
          "CORS_ORIGIN",
          `CORS_ORIGIN entries must contain only an origin: ${origin}`
        );
      }

      if (production && !isHttpsUrl(origin)) {
        addIssue(
          "CORS_ORIGIN",
          "Production CORS origins must use HTTPS"
        );
      }

      if (production && isLocalUrl(origin)) {
        addIssue(
          "CORS_ORIGIN",
          "Production CORS origins must not use localhost or local IP addresses"
        );
      }
    }

    if (!production) {
      return;
    }

    // Production web application URL.
    if (!isHttpsUrl(value.WEB_APP_URL)) {
      addIssue("WEB_APP_URL", "Production WEB_APP_URL must use HTTPS");
    }

    if (isLocalUrl(value.WEB_APP_URL)) {
      addIssue(
        "WEB_APP_URL",
        "Production WEB_APP_URL must not point to localhost or a local IP address"
      );
    }

    // Production billing callback URL.
    if (!isHttpsUrl(value.BILLING_CALLBACK_URL)) {
      addIssue(
        "BILLING_CALLBACK_URL",
        "Production BILLING_CALLBACK_URL must use HTTPS"
      );
    }

    if (isLocalUrl(value.BILLING_CALLBACK_URL)) {
      addIssue(
        "BILLING_CALLBACK_URL",
        "Production BILLING_CALLBACK_URL must not point to localhost or a local IP address"
      );
    }

    // Production Supabase URL.
    if (!isHttpsUrl(value.SUPABASE_URL)) {
      addIssue(
        "SUPABASE_URL",
        "Production SUPABASE_URL must use HTTPS"
      );
    }

    if (isLocalUrl(value.SUPABASE_URL)) {
      addIssue(
        "SUPABASE_URL",
        "Production SUPABASE_URL must not point to localhost or a local IP address"
      );
    }

    // Render runs behind a proxy. The application must also
    // be configured to trust the proxy appropriately.
    if (value.TRUST_PROXY !== true) {
      addIssue(
        "TRUST_PROXY",
        "Production must set TRUST_PROXY=true behind the Render proxy"
      );
    }

    // Paystack is optional, but any configured production key
    // must be a live secret key.
    if (
      value.PAYSTACK_SECRET_KEY &&
      !value.PAYSTACK_SECRET_KEY.startsWith("sk_live_")
    ) {
      addIssue(
        "PAYSTACK_SECRET_KEY",
        "Production Paystack credentials must be a live secret key; test keys are not allowed"
      );
    }

    // Flutterwave remains optional. Validate the secret key
    // only when one has been configured.
    // Keep FLW_SECRET_HASH available for webhook verification.

    // Stripe is optional until enabled for production.
    // When a Stripe secret key is supplied, require a live key
    // and its matching webhook signing secret.
    if (
      value.STRIPE_SECRET_KEY &&
      !value.STRIPE_SECRET_KEY.startsWith("sk_live_")
    ) {
      addIssue(
        "STRIPE_SECRET_KEY",
        "Production Stripe credentials must be a live secret key; test keys are not allowed"
      );
    }

    if (
      value.STRIPE_SECRET_KEY &&
      !value.STRIPE_WEBHOOK_SECRET
    ) {
      addIssue(
        "STRIPE_WEBHOOK_SECRET",
        "Stripe requires a webhook signing secret when enabled in production"
      );
    }

    if (
      value.STRIPE_WEBHOOK_SECRET &&
      !value.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")
    ) {
      addIssue(
        "STRIPE_WEBHOOK_SECRET",
        "Stripe webhook signing secret must start with whsec_"
      );
    }

    if (
      !value.STRIPE_SECRET_KEY &&
      value.STRIPE_WEBHOOK_SECRET
    ) {
      addIssue(
        "STRIPE_WEBHOOK_SECRET",
        "Remove the Stripe webhook secret when Stripe is not configured"
      );
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map(
      (issue) =>
        `${issue.path.join(".") || "environment"}: ${issue.message}`
    )
    .join("; ");

  throw new Error(`Invalid environment configuration: ${details}`);
}

const config = parsed.data;

// Expose provider status so routes can return controlled errors
// instead of attempting to use an unconfigured gateway.
export const paymentProviders = Object.freeze({
  paystack: Boolean(config.PAYSTACK_SECRET_KEY),

  stripe: Boolean(
    config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET
  ),

  flutterwave: Boolean(config.FLW_SECRET_KEY),
});

export const env = Object.freeze({
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  trustProxy: config.TRUST_PROXY,
  apiPrefix: config.API_PREFIX,
  corsOrigin: config.CORS_ORIGIN,

  supabaseUrl: config.SUPABASE_URL,
  supabaseAnonKey: config.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,

  paystackSecretKey: config.PAYSTACK_SECRET_KEY,
  flutterwaveSecretKey: config.FLW_SECRET_KEY,
  flutterwaveSecretHash: config.FLW_SECRET_HASH,

  stripeSecretKey: config.STRIPE_SECRET_KEY,
  stripeWebhookSecret: config.STRIPE_WEBHOOK_SECRET,

  customerCareLocalModelUrl: config.CUSTOMER_CARE_LOCAL_MODEL_URL,
  customerCareLocalModelName: config.CUSTOMER_CARE_LOCAL_MODEL_NAME,

  projectAiEnabled: config.HYSMART_PROJECT_AI_ENABLED,

  billingCallbackUrl: config.BILLING_CALLBACK_URL,
  webAppUrl: new URL(config.WEB_APP_URL).origin,
});
