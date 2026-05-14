# Environment Protection Rules — Manual Approval Gate

## Purpose

This document describes the GitHub Actions environment protection rules that enforce a manual approval gate before any production deployment. This satisfies **Requirement 6.8**: deployment is blocked until explicit approval is received from at least 1 authorized team member.

## How It Works

GitHub Actions environments support protection rules that pause workflow execution until conditions are met. Our deployment workflows (`deploy-backend.yml` and `deploy-frontend.yml`) reference `environment: production` on all deployment jobs, which triggers the approval gate automatically.

```
Push to main → CI passes → Approval requested → Reviewer approves → Deployment proceeds
                                                                    ↓
                                                              Health check
                                                                    ↓
                                                         Auto-rollback on failure
```

## Configuration Requirements

| Setting             | Value                | Rationale                                         |
| ------------------- | -------------------- | ------------------------------------------------- |
| Required reviewers  | Minimum 1            | Ensures human oversight before production changes |
| Deployment branches | `main` only          | Prevents accidental deploys from feature branches |
| Wait timer          | 0 minutes (disabled) | Manual approval already provides sufficient gate  |

## Workflow Integration

### Jobs Gated by Approval

**Backend (`deploy-backend.yml`)**:

- `migrate` — Database migrations
- `deploy-api` — API server blue-green deployment
- `deploy-websocket` — WebSocket server blue-green deployment
- `rollback` — Auto-rollback (also requires production environment access)

**Frontend (`deploy-frontend.yml`)**:

- `deploy-dashboard` — Dashboard app deployment to Vercel
- `deploy-invitation` — Invitation app deployment to Vercel
- `deploy-scanner` — Scanner PWA deployment to Vercel

### Workflow YAML Reference

Each gated job includes:

```yaml
jobs:
  deploy-api:
    runs-on: ubuntu-latest
    environment: production # ← Triggers approval gate
    steps:
      # ... deployment steps only run after approval
```

## Setup Instructions

Environment protection rules must be configured manually in the GitHub repository settings (the GitHub API does not support creating these via MCP or automation).

### Step-by-Step

1. Go to **Repository → Settings → Environments**
2. Create environment named `production` (if not already created)
3. Enable **Required reviewers**
4. Add at least 1 authorized team member as reviewer
5. Under **Deployment branches and tags**, select **Selected branches and tags**
6. Add rule: `main`
7. Save protection rules

### Recommended Reviewers

Add 2-3 team members to avoid single-point-of-failure for approvals:

- Lead developer / tech lead
- DevOps / infrastructure owner
- Project manager (optional, for visibility)

## Behavior When Triggered

1. Workflow reaches a job with `environment: production`
2. GitHub pauses the job and shows "Waiting for review" status
3. Configured reviewers receive notification (email + GitHub UI)
4. Reviewer can **Approve** or **Reject** with a comment
5. On approval: job proceeds immediately
6. On rejection: workflow is cancelled, deployment does not occur

## Verification

To verify the approval gate is working:

1. Push a change to `main` that triggers a deployment workflow
2. Confirm the workflow pauses at the deployment job with "Waiting" status
3. Approve the deployment as a configured reviewer
4. Confirm the deployment proceeds after approval

## Security Considerations

- Environment secrets (e.g., `RAILWAY_TOKEN`, `VERCEL_TOKEN`) are only accessible to approved jobs
- Rejected deployments never access production credentials
- All approval/rejection actions are logged in the GitHub Actions audit trail
- The approval gate cannot be bypassed by non-admin contributors

## Related

- [GitHub Environments Setup](./github-environments-setup.md) — Full setup guide
- [Environment Variables](./environment-variables.md) — Production secrets configuration
- Requirement 6.8 — Approval gate specification
