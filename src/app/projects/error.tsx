"use client";

import { RetryError } from "@/components/projects/retry-error";

export default function ProjectsError({ reset }: { error: Error; reset: () => void }) {
  return <RetryError reset={reset} />;
}
