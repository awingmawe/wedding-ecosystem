# Documentation Rules

## README Maintenance

- **Every time a new feature is added, modified, or removed**, the root `README.md` MUST be updated to reflect the change.
- This includes but is not limited to:
  - New routes or API endpoints
  - New UI features or pages
  - New environment variables
  - Changes to deployment configuration
  - New packages or dependencies
  - Changes to the project structure
  - Updated performance targets or scale constraints

## API Documentation & Postman

- **Every time an API endpoint is added, modified, or removed**, the following MUST be updated:
  1. **`.agents/summary/interfaces.md`** — Update the endpoint table (add/remove/modify rows)
  2. **Postman Collection** — Use the Postman MCP power to:
     - Add new requests for new endpoints
     - Update existing requests if URL/method/body changes
     - Remove requests for deleted endpoints
     - Collection: "Wedding API v2" in workspace `d41b2d97-d4c5-4609-b9e1-fe52f0bf056c`
     - **If the Postman MCP power is not installed**, ask the user: "Postman MCP belum ter-install. Silakan install dulu melalui Powers panel agar saya bisa update Postman collection secara otomatis."
  3. **Response Cache** (`plugins/response-cache.ts`) — Add/remove cache routes and invalidation rules if the endpoint is cacheable

- **When to update (triggers):**
  - New route file created or new endpoint added to existing route
  - Endpoint URL path changed (e.g., moved from `/events` to `/cms`)
  - Request body schema changed
  - Response format changed
  - Endpoint removed/deprecated
  - Auth requirements changed (public → protected or vice versa)

- **When NOT to update (internal refactors):**
  - Code reorganization that doesn't change API contract
  - Middleware changes that don't affect request/response
  - Service layer refactoring
  - Repository pattern changes

## What to Update

When a feature changes, update the relevant section(s) in `README.md`:

1. **Spesifikasi Aplikasi** — If the feature adds/changes app capabilities
2. **Tech Stack** — If new dependencies are introduced
3. **Environment Variables** — If new env vars are required
4. **Cara Penggunaan** — If user-facing workflows change
5. **Struktur Project** — If new files/folders are added to the architecture
6. **Deploy Production** — If deployment steps or config change

## Style

- Keep descriptions concise (1 sentence per feature row)
- Use Bahasa Indonesia for user-facing descriptions
- Use English for technical terms and code references
- Update test counts if new test files are added
