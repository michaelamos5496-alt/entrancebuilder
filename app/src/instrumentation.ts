import type { Instrumentation } from "next";
import { errorSummary, log } from "@/lib/log";

/**
 * Server-side error capture. Every unhandled server error is logged as one structured line (no stack, no headers,
 * no query string, no body). To forward to an error-tracking service later, send the same payload from here.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  log("error", "server_error", {
    ...errorSummary(err),
    path: request.path.split("?")[0],
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
