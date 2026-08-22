# CI/CD Setup Checklist

## Quick Setup (5 minutes)

### ✅ Step 1: Commit and Push Workflows

```bash
cd C:/Users/joeyk/onedrive/apps/scoundrel

# Check files
git status

# Add workflow files
git add .github/workflows/

# Commit
git commit -m "Add GitHub Actions for automated testing"

# Push to GitHub
git push
```

### ✅ Step 2: Verify It's Working

1. Go to your GitHub repository
2. Click the **"Actions"** tab at the top
3. You should see a workflow running!
4. Wait ~3 minutes for it to complete
5. See green checkmark ✓ = Success!

### ✅ Step 3: Add Status Badge (Optional)

Add this to the top of your `README.md`:

```markdown
# Scoundrel

[![Mobile Tests](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/mobile-tests.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/mobile-tests.yml)

A dungeon-crawling card game built with React.
```

**Replace**:
- `YOUR_USERNAME` with your GitHub username
- `YOUR_REPO` with your repository name

**Result**: 
![Badge](https://img.shields.io/badge/tests-passing-brightgreen) Shows test status!

### ✅ Step 4: Set Up Branch Protection (Recommended)

This prevents merging code that breaks tests.

1. Go to **Settings** → **Branches**
2. Click **"Add rule"** or **"Add branch protection rule"**
3. **Branch name pattern**: `main` (or `master`)
4. Check these boxes:
   - ✅ **"Require status checks to pass before merging"**
   - ✅ **"Mobile Responsive Tests"** (from the list)
   - ✅ **"Require branches to be up to date before merging"**
5. Click **"Create"** or **"Save changes"**

Now PRs require passing tests! 🎉

## What Happens Now

### On Every Push:
```
1. You push code
   ↓
2. GitHub Actions detects push
   ↓
3. Workflow starts automatically
   ↓
4. Installs dependencies
   ↓
5. Runs 25 mobile tests
   ↓
6. Shows ✓ or ✗ on commit
```

### On Every Pull Request:
```
1. You create PR
   ↓
2. Tests run automatically
   ↓
3. PR shows status:
   - ✓ "All checks have passed"
   - ✗ "Some checks failed"
   ↓
4. Can't merge until tests pass!
```

## Quick Commands

### View Workflow Status
```bash
# Install GitHub CLI (if not installed)
# Download from: https://cli.github.com/

# View all workflow runs
gh run list

# Watch latest run
gh run watch

# View specific run
gh run view <run-id>
```

### Download Test Reports
```bash
# Download artifacts from latest run
gh run download

# Or download from GitHub UI:
# 1. Go to Actions tab
# 2. Click on a workflow run
# 3. Scroll to "Artifacts"
# 4. Click to download
```

### Run Tests Manually
```bash
# From GitHub UI:
# 1. Actions tab
# 2. Select workflow
# 3. Click "Run workflow"
# 4. Select branch
# 5. Click "Run workflow"

# Or with GitHub CLI:
gh workflow run mobile-tests.yml
```

## Troubleshooting

### Tests Pass Locally But Fail in CI

**Check:**
1. Are dependencies properly installed? (`npm ci` vs `npm install`)
2. Are there environment-specific issues?
3. Are fonts loading correctly?

**Fix:**
```yaml
# Add to workflow if needed
- name: Install system dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y fonts-liberation
```

### Workflow Not Running

**Check:**
1. Is `.github/workflows/` in the root of your repo?
2. Are YAML files properly formatted? (no tabs, proper indentation)
3. Did you push to the right branch?

**Fix:**
```bash
# Validate YAML syntax
npx yaml-lint .github/workflows/*.yml

# Check git status
git status
git log --oneline -5
```

### Too Many CI Minutes Used

GitHub free tier:
- **Public repos**: Unlimited minutes
- **Private repos**: 2,000 minutes/month

**Reduce usage:**
1. Only run on main branch
2. Skip tests on doc changes
3. Use Chromium only (not all browsers)

```yaml
on:
  push:
    branches: [ main ]  # Only main
    paths-ignore:
      - '**.md'         # Skip on doc changes
```

## Monitoring

### Email Notifications

You'll automatically get emails when:
- ❌ First failure after passing
- ✅ First success after failing  
- 🔴 Any failure on main branch

### View in GitHub

**Commit Page:**
- Green ✓ = Passed
- Red ✗ = Failed
- Yellow ○ = Running

**Actions Tab:**
- See all workflow runs
- Filter by status
- View logs and artifacts

**Pull Requests:**
- Status checks shown automatically
- Required checks block merge
- Re-run failed checks

## Files Created

### Workflow Files
```
.github/
  workflows/
    mobile-tests.yml  ← Fast mobile tests (2-3 min)
    ci.yml           ← Full CI (lint, build, test) (5-10 min)
```

### Documentation
```
GITHUB_ACTIONS_SETUP.md  ← Detailed guide
CI_SETUP_CHECKLIST.md    ← This file
```

## Which Workflow Runs When?

### `mobile-tests.yml` (Simple)
- **Triggers**: Every push, every PR
- **Runs**: Mobile tests only (25 tests)
- **Duration**: 2-3 minutes
- **Use**: Quick feedback on mobile changes

### `ci.yml` (Comprehensive)
- **Triggers**: Every push, every PR
- **Runs**: Lint → Build → Mobile Tests → All Tests
- **Duration**: 5-10 minutes
- **Use**: Complete quality check

**Both run by default** - you can disable one if you prefer.

## Disable a Workflow

### Temporarily Disable
1. Go to **Actions** tab
2. Click workflow name
3. Click **"•••"** menu
4. Click **"Disable workflow"**

### Permanently Remove
```bash
# Delete workflow file
git rm .github/workflows/mobile-tests.yml
git commit -m "Remove mobile tests workflow"
git push
```

## Next Steps After Setup

### ✅ Immediate (Today)
- [x] Commit workflow files
- [x] Push to GitHub
- [x] Verify first run succeeds
- [ ] Add status badge to README
- [ ] Set up branch protection

### ✅ Soon (This Week)
- [ ] Test that failed tests block merge
- [ ] Download and review test reports
- [ ] Share status badge with team

### ✅ Optional (As Needed)
- [ ] Add Slack notifications
- [ ] Set up Dependabot
- [ ] Add more test types
- [ ] Configure scheduled runs
- [ ] Set up deployment workflow

## Success Criteria

✅ **Workflow runs on every push**
✅ **Green checkmark on passing commits**
✅ **Red X on failing commits**
✅ **Test reports available as artifacts**
✅ **Branch protection prevents broken merges**
✅ **Team sees status badge**

## Summary

**Created**: 2 GitHub Actions workflows
**Tests**: 25 automated mobile tests
**Triggers**: Every push and PR
**Reports**: Automatic upload on completion
**Protection**: Optional branch protection

**Ready to go!** Just commit and push:

```bash
git add .github/
git commit -m "Add CI/CD workflows"
git push
```

Then visit: **Your Repo → Actions tab** 🚀

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `gh run list` | View all workflow runs |
| `gh run watch` | Watch latest run live |
| `gh run download` | Download test artifacts |
| `gh workflow run mobile-tests.yml` | Trigger workflow manually |
| `gh workflow disable mobile-tests.yml` | Disable workflow |
| `gh workflow enable mobile-tests.yml` | Enable workflow |

| File | Purpose |
|------|---------|
| `.github/workflows/mobile-tests.yml` | Mobile test workflow |
| `.github/workflows/ci.yml` | Complete CI workflow |
| `GITHUB_ACTIONS_SETUP.md` | Detailed setup guide |
| `CI_SETUP_CHECKLIST.md` | This checklist |
