# Review Notes

## Consistency Check

### ✅ Consistent Across Documents

- **Tech stack versions** — All documents reference the same pinned versions (Next.js 16.2, Fastify 5, Prisma 7.7, Socket.io 4.8, etc.)
- **Architecture terminology** — Consistent use of "tenant isolation", "room-based WebSocket", "offline-first" across all files
- **Package names** — Consistent `@wedding/*` naming convention throughout
- **Port assignments** — Dashboard :3000, Invitation :3001, Scanner :3002, API :4000 consistent everywhere
- **Scale constraints** — 1 event, 500 guests, single instance consistently documented
- **Enum values** — All 11 enums match between `data_models.md` and `interfaces.md`
- **API endpoint patterns** — Routes in `interfaces.md` match the service responsibilities in `components.md`

### ⚠️ Minor Inconsistencies Found

| Location | Issue | Resolution |
|----------|-------|------------|
| `codebase_info.md` vs actual `package.json` | codebase_info lists Motion 12.17.0 (from steering), actual is 12.38.0 | Actual version in dependencies.md is correct (12.38.0) |
| `codebase_info.md` vs actual | Lists react-query 5.89.0 (from steering), actual is 5.100.10 | dependencies.md has correct version |
| `codebase_info.md` vs actual | Lists Fastify 5.3.2 (from steering), actual is 5.8.5 | dependencies.md has correct version |
| `codebase_info.md` vs actual | Lists Next.js 16.2.0 (from steering), actual is 16.2.6 | dependencies.md has correct version |

**Note**: The `codebase_info.md` tech stack table uses versions from the steering docs (`.kiro/steering/tech.md`), while `dependencies.md` uses actual `package.json` values. The steering docs appear slightly outdated. **Recommendation**: Use `dependencies.md` as the source of truth for exact versions.

## Completeness Check

### ✅ Well-Documented Areas

- Backend service layer (all 11 services documented with responsibilities)
- Database schema (all 10 models, all fields, all indexes)
- API endpoints (comprehensive REST + WebSocket coverage)
- Workflows (12 key flows with sequence diagrams)
- Security architecture (auth, RBAC, encryption, rate limiting)
- Deployment pipeline (CI/CD, blue-green, rollback)
- Offline-first architecture (IndexedDB, sync, conflict resolution)

### ⚠️ Areas Lacking Detail

| Area | Gap | Impact | Recommendation |
|------|-----|--------|----------------|
| ~~**Testing patterns**~~ | ~~No dedicated testing documentation~~ | ✅ Resolved | `testing.md` added with full mock strategies, property-based patterns, 2-level mocking guide |
| **Repository migration** | Only Guest and CheckIn domains have `*.repository.ts` files. CMS, RSVP, Events still call Prisma from service layer. | Medium | Migrate remaining domains to full route → service → repository pattern for consistency |
| **Error handling patterns** | Error codes listed but no flow for error propagation | Low | Document how errors flow from service → route → client |
| **Theme system** | Theme presets and customization logic not detailed | Low | Document the 5 preset themes and hex customization flow |
| **Media upload pipeline** | Virus scanning and R2 upload flow not in workflows | Low | Add workflow diagram for media upload |
| **Secret rotation** | `config/secret-rotation.ts` exists but not documented in workflows | Low | Document rotation schedule and grace period logic |
| **Monitoring/Alerting** | `docs/monitoring/alert-rules.md` exists but not referenced | Low | Cross-reference monitoring docs |
| **Cloudflare Workers** | CDN cache worker, security headers worker, image resizer exist in `docs/` | Low | Document as part of infrastructure |
| **Database migrations** | Migration history and strategy not documented | Low | Document migration workflow and naming conventions |
| **Environment-specific behavior** | Redis graceful degradation (dev without Redis) not detailed | Low | Document fallback behavior |

### 🔍 Language Support Gaps

- **No gaps** — The entire codebase is TypeScript/JavaScript, which is fully supported for analysis
- Shell scripts in `scripts/` and `docs/deployment/cloudflare/scripts/` are documented at a high level but individual script logic is not detailed (acceptable — they are deployment utilities)

## Recommendations

1. **Version source of truth**: Update `.kiro/steering/tech.md` to match actual `package.json` versions, or add a note in `codebase_info.md` directing readers to `dependencies.md` for exact versions
2. **Testing documentation**: Consider adding a `testing.md` file documenting the ~1149 tests, property-based testing patterns with fast-check, and mock strategies used across services
3. **Keep docs updated**: When adding new services, routes, or models, update the corresponding documentation file
4. **Cloudflare infrastructure**: The `docs/deployment/cloudflare/` directory contains significant infrastructure code (Workers, scripts) that could be documented in a separate `infrastructure.md`
