"use client";

import { useAuth } from "@clerk/nextjs";
import { createApiClient } from "./api-client";

/**
 * Returns a function that produces a fresh, token-bound API client per call.
 * Clerk session tokens are short-lived and rotate, so we deliberately don't
 * cache the client. Callers do `const api = await getApi()` right before
 * each request.
 */
export function useApiClient() {
  const { getToken } = useAuth();

  return async function getApi() {
    const token = await getToken();
    return createApiClient(token);
  };
}
