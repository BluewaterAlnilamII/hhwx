# Global Foundation Rules

## Stack and Preferred Libraries

- Use Next.js App Router, React, and TypeScript strict mode for the frontend framework.
- Prefer Tailwind CSS for styling. Prefer Shadcn UI / Radix UI when reusable interaction primitives are needed.
- Prefer Zustand for shared state across pages or components. Prefer React hooks or `useReducer` for local workflow state.
- Use Supabase consistently for data and authentication. Browser code may only use anonymous publishable clients; service role usage is restricted to server-side modules.
- Prefer Recharts for charts, dnd-kit for drag-and-drop interactions, and `clsx` + `tailwind-merge` for class name merging.
- Prefer `@/*` imports that point to `src/` to reduce deep relative paths.

## Common Commands

- Development server: `npm run dev`
- Production build: `npm run build`
- Production server: `npm run start`
- Lint: `npm run lint`

## Verification Defaults

- Use the narrowest relevant check for small edits.
- Run `npm run lint` and `npm run build` before review for broad code, schema, route, or open-source-readiness changes when feasible.

## Architecture Patterns

- Follow a "thin pages / thin routes, thick service modules" layering model: page components compose UI, API routes parse parameters, enforce authorization, and format responses, while business rules live in hooks, `lib`, or `lib/*-server.ts`.
- Prefer reusable pure functions for pure computation, rule checks, and data transformations. Do not couple them to JSX, DOM events, or network requests.
- Centralize shared data fetching, cache policies, and subscription merge logic in common hooks or shared services. Do not duplicate similar request code across pages.
- For high-computation frontend logic, prefer Web Workers or other asynchronous isolation mechanisms to avoid blocking the main thread.
- When caching is needed, prefer centralized cache policies and cache tags. Do not scatter hard-coded TTLs, `revalidate` values, or tag names across routes.

## Patterns to Avoid

- Stacking large amounts of business logic, permission checks, or data transformation directly inside page components or JSX.
- Copying the same query, formatting, or error-handling logic across multiple API routes.
- Reading service role credentials in client code, or assuming frontend permission checks are enough to protect write operations.
- Bypassing existing service layers, cache layers, or type boundaries for a local fix.
