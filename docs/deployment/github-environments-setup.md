# GitHub Environments Setup — Production Approval Gate

This document describes how to configure GitHub Actions environment protection rules to enforce manual approval before production deployments.

## Overview

GitHub Actions environments allow you to define protection rules that block workflow jobs from executing until specific conditions are met. For this project, the `production` environment requires **at least 1 authorized approver** before any deployment proceeds.

This integrates with the `deploy-backend.yml` and `deploy-frontend.yml` workflows, which reference `environment: production` in their deployment jobs.

## Prerequisites

- Repository admin access on GitHub
- At least 1 team member designated as a deployment approver

## Step 1: Create the `production` Environment

1. Navigate to your repository on GitHub
2. Go to **Settings** → **Environments**
3. Click **New environment**
4. Enter the name: `production`
5. Click **Configure environment**

## Step 2: Add Required Reviewers

1. In the `production` environment configuration page, check **Required reviewers**
2. Add at least **1 authorized team member** as a reviewer
   - Search by GitHub username and select the appropriate person(s)
   - Recommended: add 2-3 reviewers so deployments aren't blocked by a single person's availability
3. Click **Save protection rules**

When a workflow job targets this environment, GitHub will pause execution and notify the listed reviewers. The job will not proceed until at least 1 reviewer explicitly approves.

## Step 3: Configure Wait Timer (Optional)

If you want an additional delay before deployment (e.g., to allow time for last-minute objections):

1. In the environment configuration, check **Wait timer**
2. Set the number of minutes to wait (0–43200)
3. Click **Save protection rules**

For most cases, a wait timer is not needed since the manual approval already provides a gate.

## Step 4: Configure Deployment Branch Rules (Recommended)

Restrict which branches can deploy to the `production` environment:

1. Under **Deployment branches and tags**, select **Selected branches and tags**
2. Add a rule for `main` (or your release branch pattern, e.g., `release/*`)
3. Click **Save protection rules**

This prevents accidental deployments from feature branches.

## How It Integrates with Deployment Workflows

### Backend Deployment (`deploy-backend.yml`)

The backend deployment workflow uses `environment: production` on the deploy job:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Railway (blue-green)
        # ... deployment steps
```

When this job is reached, GitHub Actions will:

1. Pause the workflow
2. Send a notification to the configured reviewers
3. Wait for explicit approval from at least 1 reviewer
4. Only then proceed with the deployment

### Frontend Deployment (`deploy-frontend.yml`)

Similarly, the frontend deployment workflow references the same environment:

```yaml
jobs:
  deploy-dashboard:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy Dashboard to Vercel
        # ... deployment steps

  deploy-invitation:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy Invitation App to Vercel
        # ... deployment steps

  deploy-scanner:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy Scanner to Vercel
        # ... deployment steps
```

Each app deployment job independently requires approval, allowing reviewers to approve or reject individual app deployments.

## Approval Workflow

When a deployment is triggered:

1. **CI passes** — Tests, security scans, and static analysis complete successfully
2. **Approval requested** — GitHub notifies the configured reviewers via email and GitHub UI
3. **Reviewer acts** — The reviewer can:
   - **Approve**: Deployment proceeds immediately
   - **Reject**: Deployment is cancelled with a reason
4. **Deployment executes** — After approval, the deployment job runs
5. **Health check** — Post-deployment health checks verify the release (auto-rollback on failure)

## Viewing Pending Approvals

Reviewers can find pending approvals in:

- **Email notifications** from GitHub
- **Repository Actions tab** → look for workflows with a "Waiting" status badge
- **GitHub mobile app** notifications

## Environment Secrets

The `production` environment can also hold environment-specific secrets (e.g., `RAILWAY_TOKEN`, `VERCEL_TOKEN`). These secrets are only available to jobs that target the `production` environment and have been approved:

1. In the environment configuration page, scroll to **Environment secrets**
2. Click **Add secret**
3. Add deployment-specific secrets (e.g., `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`)

This ensures deployment credentials are never exposed to CI jobs that haven't passed the approval gate.

## Troubleshooting

| Issue                                   | Solution                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Deployment stuck on "Waiting"           | Check that at least 1 configured reviewer has approved                          |
| Reviewer not receiving notifications    | Verify their notification settings in GitHub → Settings → Notifications         |
| Branch not allowed to deploy            | Check Deployment branches rules in environment settings                         |
| Environment not found error in workflow | Ensure the environment name in the workflow YAML matches exactly (`production`) |

## Related Documents

- [Environment Variables](./environment-variables.md) — Full list of production environment variables
- [Railway Networking](./railway-networking.md) — Backend infrastructure configuration
- Requirement 6.8 — CI/CD Pipeline approval gate specification
