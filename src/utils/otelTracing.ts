import { trace, context, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("bot-llm");

/**
 * Wrap an LLM provider call with OpenTelemetry tracing.
 * Usage: const result = await traceLlmCall("openrouter", () => openai.chat.completions.create(...));
 */
export async function traceLlmCall<T>(
  provider: string,
  fn: () => Promise<T>,
  metadata?: Record<string, string>,
): Promise<T> {
  const span = tracer.startSpan(`llm.${provider}`, {
    attributes: {
      "llm.provider": provider,
      ...metadata,
    },
  });

  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      fn,
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.setAttribute("error.type", err instanceof Error ? err.name : "Unknown");
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Wrap an HTTP handler with tracing.
 */
export function traceHttpHandler(name: string, handler: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    const span = tracer.startSpan(`http.${name}`, {
      attributes: {
        "http.method": req.method,
        "http.url": req.url,
      },
    });

    try {
      await context.with(
        trace.setSpan(context.active(), span),
        () => handler(req, res),
      );
      span.setAttribute("http.status_code", res.statusCode || 200);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  };
}
