# GitHub Actions Setup Guide

## Overview

I've created GitHub Actions workflows that automatically run tests on every push to your repository.

## Files Created

### 1. `.github/workflows/mobile-tests.yml`
- **Runs:** Mobile responsive tests only
- **Triggers:** Every push and pull request
- **Duration:** ~2-3 minutes
- **Fast and focused on mobile optimizations**

### 2. `.github/workflows/ci.yml` (Comprehensive)
- **Runs:** Lint, Build, Mobile tests, and optionally all tests
- **Triggers:** Every push and pull request
- **Duration:** ~5-10 minutes
- **Complete quality check**

## How It Works

### On Every Push:
1. ✅ GitHub detects your push
2. ✅ Workflow starts automatically
3. ✅ Installs Node.js and dependencies
4. ✅ Installs Playwright browsers
5. ✅ Runs mobile tests
6. ✅ Uploads test reports
7. ✅ Shows pass/fail status

### What Gets Tested:
- All 25 mobile responsive tests
- Descent view (8 tests)
- Sanctuary view (5 tests)
- Desktop layout (3 tests)
- Full game flow (3 tests)
- Screen sizes (4 tests)
- Touch targets (2 tests)

## Setup Instructions

### Step 1: Commit the Workflow Files

```bash
cd C:/Users/joeyk/onedrive/apps/scoundrel

# Check what will be committed
git status

# Add workflow files
git add .github/workflows/

# Commit
git commit -m "Add GitHub Actions for mobile tests"

# Push to GitHub
git push
```

### Step 2: Verify Workflows Are Running

1. Go to your GitHub repository
2. Click the **"Actions"** tab
3. You should see workflows running!

### Step 3: View Test Results

After a workflow runs:

1. Click on the workflow run
2. Click on the job (e.g., "Mobile Responsive Tests")
3. Expand steps to see details
4. Download artifacts to see HTML reports

## Workflow Status

### Where to See Status:

**1. GitHub Repository:**
- Main page shows status badge
- Actions tab shows all runs
- Pull requests show status checks

**2. Pull Requests:**
- Status appears automatically
- Must pass before merging
- Shows which tests failed

**3. Commit History:**
- Green checkmark ✓ = passed
- Red X ✗ = failed
- Yellow circle ○ = running

## Adding a Status Badge

Add this to your `README.md`:

```markdown
# Scoundrel

[![Mobile Tests](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/mobile-tests.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/mobile-tests.yml)

Your game description here...
```

Replace:
- `YOUR_USERNAME` with your GitHub username
- `YOUR_REPO` with your repository name

Result: A badge showing test status! 
- ![Passing](https://img.shields.io/badge/tests-passing-brightgreen) if tests pass
- ![Failing](https://img.shields.io/badge/tests-failing-red) if tests fail

## Understanding Workflow Files

### Mobile Tests Workflow (Simple)

```yaml
name: Mobile Responsive Tests

on:
  push:                          # Run on every push
    branches: [ main, master ]   # To these branches
  pull_request:                  # And on every PR

jobs:
  test:
    runs-on: ubuntu-latest       # Linux environment
    
    steps:
      - Checkout code
      - Setup Node.js
      - Install dependencies
      - Install Playwright
      - Run mobile tests
      - Upload results
```

### CI Workflow (Comprehensive)

```yaml
name: CI

jobs:
  lint-and-build:     # Job 1: Check code quality
    - Run linter
    - Build project
    
  mobile-tests:       # Job 2: Test mobile (needs Job 1)
    - Run mobile tests
    - Upload reports
    
  all-tests:          # Job 3: All tests (only on main)
    - Run all tests
```

## Customization

### Run Tests Only on Main Branch

Edit `.github/workflows/mobile-tests.yml`:

```yaml
on:
  push:
    branches: [ main ]  # Remove other branches
```

### Run Tests on Every Branch

```yaml
on:
  push:
    branches: [ '**' ]  # All branches
```

### Add More Test Types

```yaml
- name: Run accessibility tests
  run: npm run test:a11y

- name: Run performance tests
  run: npm run test:perf
```

### Change Node.js Version

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # Change to 20 or 22
```

### Fail Fast (Stop on First Failure)

```yaml
jobs:
  test:
    strategy:
      fail-fast: true
```

### Test on Multiple OS

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
```

## Viewing Test Results

### In GitHub Actions UI:

1. **Go to Actions tab**
2. **Click on a workflow run**
3. **Click on a job** (e.g., "Mobile Responsive Tests")
4. **See output**:
   ```
   Running 25 tests using 1 worker
   ✓ should show compact header on mobile (2.1s)
   ✓ should have no vertical scrollbar... (1.8s)
   ...
   25 passed (48.2s)
   ```

### Download Test Reports:

1. Scroll to bottom of workflow run
2. Click **"Artifacts"**
3. Download **"playwright-report"**
4. Unzip and open `index.html`
5. See full interactive report!

### On Failures:

1. Workflow shows red X ✗
2. Download **"test-failures"** artifact
3. Contains screenshots and videos
4. Debug locally with same data

## Notifications

### Email Notifications:

GitHub automatically sends emails on:
- First failure after success
- First success after failure
- Always on main branch failures

### Slack Notifications (Optional):

Add to workflow:

```yaml
- name: Notify Slack
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## Branch Protection Rules

### Require Tests to Pass Before Merge:

1. Go to **Settings** → **Branches**
2. Click **"Add rule"**
3. Branch name pattern: `main`
4. Check **"Require status checks to pass"**
5. Select **"Mobile Responsive Tests"**
6. Check **"Require branches to be up to date"**
7. Save

Now PRs can't be merged until tests pass! ✅

## Troubleshooting

### Tests Pass Locally But Fail in CI

**Common causes:**

1. **Fonts not loading**
   ```yaml
   - name: Install fonts
     run: |
       sudo apt-get update
       sudo apt-get install -y fonts-liberation
   ```

2. **Timezone differences**
   ```yaml
   env:
     TZ: America/New_York
   ```

3. **Missing environment variables**
   ```yaml
   env:
     NODE_ENV: test
   ```

### Tests Timeout

Increase timeout:

```yaml
jobs:
  test:
    timeout-minutes: 20  # Default is 10
```

### Tests Are Too Slow

Only install Chromium (not all browsers):

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
```

### Out of CI Minutes

GitHub free tier gives:
- **2,000 minutes/month** for private repos
- **Unlimited** for public repos

To reduce usage:
- Only run on main branch
- Skip tests on docs changes
- Use smaller timeout values

### Skip Tests on Docs Changes

```yaml
on:
  push:
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

## Cost Optimization

### Run Tests Conditionally

```yaml
on:
  push:
    paths:
      - 'src/**'           # Only when code changes
      - 'visual/**'        # Or tests change
      - 'package*.json'    # Or dependencies change
```

### Skip Draft PRs

```yaml
jobs:
  test:
    if: github.event.pull_request.draft == false
```

### Cache Dependencies

Already included in workflows:

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'  # Caches node_modules
```

## Advanced Features

### Matrix Testing (Multiple Configs)

```yaml
jobs:
  test:
    strategy:
      matrix:
        node: [18, 20, 22]
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
```

### Scheduled Tests (Nightly)

```yaml
on:
  schedule:
    - cron: '0 0 * * *'  # Run at midnight daily
```

### Manual Workflow Trigger

```yaml
on:
  workflow_dispatch:  # Adds "Run workflow" button
```

## Security

### Secrets Management

For API keys, tokens, etc.:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Add secret (e.g., `SLACK_WEBHOOK`)
4. Use in workflow:

```yaml
env:
  API_KEY: ${{ secrets.API_KEY }}
```

### Dependabot Updates

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Automatically creates PRs for dependency updates!

## Monitoring

### Check Workflow Status:

```bash
# Using GitHub CLI
gh run list

# Check status of latest run
gh run view

# Watch live run
gh run watch
```

### View Logs:

```bash
# Download logs of latest run
gh run download

# View logs in terminal
gh run view --log
```

## What Happens on Push

### 1. Push Code
```bash
git push origin main
```

### 2. GitHub Actions Triggers
- Detects `.github/workflows/*.yml`
- Starts workflow runners
- Queues jobs

### 3. Jobs Run
```
Lint and Build (2 min)
  ✓ Lint passed
  ✓ Build successful

Mobile Tests (3 min)
  ✓ 25 tests passed
  ✓ Report uploaded

All Tests (5 min)
  ✓ All suites passed
```

### 4. Results Posted
- Green checkmark on commit
- PR shows status
- Email notification (if failed)

## Next Steps

### 1. Push Workflows to GitHub
```bash
git add .github/workflows/
git commit -m "Add CI/CD workflows"
git push
```

### 2. Check Actions Tab
- Watch first workflow run
- Verify tests pass
- Download report

### 3. Add Status Badge
- Update README.md
- Show build status
- Looks professional!

### 4. Set Up Branch Protection
- Require tests to pass
- Prevent broken code
- Enforce quality

### 5. Optional Enhancements
- Add Slack notifications
- Set up Dependabot
- Add more test types
- Enable matrix testing

## Summary

✅ **Two workflows created**:
- `mobile-tests.yml` - Fast mobile tests
- `ci.yml` - Comprehensive quality checks

✅ **Auto-runs on**:
- Every push
- Every pull request
- Can also schedule or trigger manually

✅ **Reports**:
- HTML reports as artifacts
- Screenshots on failure
- Videos on failure
- Email notifications

✅ **Next**: Push to GitHub and watch it work!

```bash
git add .github/
git commit -m "Add GitHub Actions CI/CD"
git push
```

Then visit: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions` 🚀
