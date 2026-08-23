import * as Sentry from "@sentry/node";
import logger from "../utils/logger.js";

export function initObservability() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
    console.info("[observability] Sentry init");
  }
  if (process.env.OTEL_ENABLED === "true") {
    import("@opentelemetry/sdk-node")
      .then(({ NodeSDK }) => {
        const sdk = new NodeSDK({});
        sdk.start();
        console.info("[observability] OpenTelemetry started");
      })
      .catch(() => {
        logger.warn("[observability] OpenTelemetry SDK not available");
      });
  }
}
