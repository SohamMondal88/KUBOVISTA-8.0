// Vercel may inject `import { inject } from '@vercel/analytics'` into static
// browser modules. This project already uses consent-gated Google Analytics,
// so keep the optional Vercel hook inert while preserving native ESM loading.
export function inject() {}
