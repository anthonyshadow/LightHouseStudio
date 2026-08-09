/** Portable provider HTTP boundary shared by Node-backed tests and the Bun API runtime. */
export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
