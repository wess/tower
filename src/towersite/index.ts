// The Tower project's marketing + docs site, served by the edge at
// tower.<baseDomain>. It's static (no per-request data), so the edge renders it
// directly — no separate app/microVM.
export { landing } from "./landing.ts"
export { renderDoc } from "./docs.ts"
