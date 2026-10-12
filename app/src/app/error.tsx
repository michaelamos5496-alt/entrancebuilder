"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/layout/ErrorReporter";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(`Render error: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`); }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <ErrorState as="h1" action={<Button onClick={reset}>Try again</Button>}>An unexpected error occurred. Your saved designs are safe.</ErrorState>
    </div>
  );
}
