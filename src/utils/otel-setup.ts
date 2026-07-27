/**
 * otel-setup.ts — OpenTelemetry initialization
 *
 * Must be imported BEFORE any other module to ensure auto-instrumentation works.
 * Usage: node --import ./dist/utils/otel-setup.js dist/bot.js
 *
 * Exports traces to OTLP HTTP endpoint (Jaeger, Grafana Tempo, etc.)
 * Falls back to console exporter if OTEL_EXPORTER_OTLP_ENDPOINT is not set.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import logger from "./logger.js";

const serviceName = "discord-bot";

const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    })
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  traceExporter,
  spanProcessors: [
    new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 512,
      maxExportBatchSize: 64,
      scheduledDelayMillis: 5000,
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
    }),
  ],
});

let initialized = false;

export function initOpenTelemetry(): void {
  if (initialized) return;
  initialized = true;

  try {
    sdk.start();
    logger.info("[OTel] OpenTelemetry initialized — service: " + serviceName);

    if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      logger.info("[OTel] No OTLP endpoint set — using console exporter");
    }
  } catch (err) {
    logger.warn(`[OTel] Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!initialized) return;
  try {
    await sdk.shutdown();
    logger.info("[OTel] Shutdown complete");
  } catch (err) {
    logger.warn(`[OTel] Shutdown error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Auto-init if OTEL_ENABLED is set
if (process.env.OTEL_ENABLED === "true") {
  initOpenTelemetry();
}
