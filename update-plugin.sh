#!/usr/bin/env bash
# =============================================================================
# oh-my-claudecode Manual Update Script
#
# Fetches upstream changes, merges with the security-hardened branch,
# rebuilds, and redeploys to the Claude Code plugin cache.
#
# Usage:
#   ./update-plugin.sh              # Interactive merge (stops on conflicts)
#   ./update-plugin.sh --dry-run    # Show what would change, don't apply
#   ./update-plugin.sh --force      # Overwrite cache even if merge had issues
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR"
PLUGIN_VERSION="4.1.7"
CACHE_DIR="$HOME/.claude/plugins/cache/omc/oh-my-claudecode/$PLUGIN_VERSION"
PATCHED_BRANCH="security-hardened"
UPSTREAM_REMOTE="origin"
UPSTREAM_BRANCH="main"

# Runtime directories to copy (no src/, tests, or dev files)
RUNTIME_DIRS=(dist bridge scripts skills agents commands hooks .claude-plugin docs templates node_modules)
RUNTIME_FILES=(.mcp.json package.json package-lock.json AGENTS.md LICENSE README.md)

DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force)   FORCE=true ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--force]"
      echo ""
      echo "  --dry-run   Show what upstream changes exist, don't merge or deploy"
      echo "  --force     Redeploy even if merge produces warnings"
      echo ""
      echo "Source repo:  $SRC_DIR"
      echo "Cache dir:    $CACHE_DIR"
      echo "Branch:       $PATCHED_BRANCH"
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*" >&2; }
error() { echo "[ERROR] $*" >&2; }
die()   { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
cd "$SRC_DIR" || die "Cannot cd to $SRC_DIR"

# Verify we're in the right repo
if [ ! -f ".claude-plugin/plugin.json" ]; then
  die "Not an oh-my-claudecode repo: .claude-plugin/plugin.json not found"
fi

# Verify we're on the patched branch
CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "$PATCHED_BRANCH" ]; then
  info "Switching to $PATCHED_BRANCH branch..."
  git checkout "$PATCHED_BRANCH" || die "Cannot switch to $PATCHED_BRANCH"
fi

# Check for uncommitted SOURCE changes (ignore dist/ and bridge/ build artifacts)
SRC_CHANGES="$(git diff --name-only HEAD 2>/dev/null | grep -v '^dist/' | grep -v '^bridge/' || true)"
if [ -n "$SRC_CHANGES" ]; then
  warn "Uncommitted source changes detected:"
  echo "$SRC_CHANGES" | head -10 >&2
  if [ "$FORCE" = false ]; then
    die "Commit or stash source changes before updating. Use --force to skip this check."
  fi
fi

# ---------------------------------------------------------------------------
# Fetch upstream
# ---------------------------------------------------------------------------
info "Fetching upstream from $UPSTREAM_REMOTE..."
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" || die "Failed to fetch upstream"

LOCAL_HEAD="$(git rev-parse HEAD)"
UPSTREAM_HEAD="$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
MERGE_BASE="$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"

if [ "$UPSTREAM_HEAD" = "$MERGE_BASE" ]; then
  info "Already up to date with upstream. No new commits."
  if [ "$FORCE" = false ]; then
    exit 0
  fi
  info "--force specified, redeploying anyway."
fi

# Show what's new
AHEAD="$(git rev-list --count "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"..HEAD)"
BEHIND="$(git rev-list --count "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
info "Local is $AHEAD commits ahead, $BEHIND commits behind upstream."

if [ "$BEHIND" -gt 0 ]; then
  info ""
  info "New upstream commits:"
  git log --oneline "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | head -20
  info ""
fi

# ---------------------------------------------------------------------------
# Dry-run: stop here
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = true ]; then
  if [ "$BEHIND" -gt 0 ]; then
    info "Files that would change:"
    git diff --stat "HEAD...$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | tail -5
    info ""
    info "Potential conflicts with security patches:"
    # Check which patched files are also changed upstream
    PATCHED_FILES="$(git diff --name-only "$MERGE_BASE" HEAD)"
    UPSTREAM_FILES="$(git diff --name-only "$MERGE_BASE" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
    CONFLICTS="$(comm -12 <(echo "$PATCHED_FILES" | sort) <(echo "$UPSTREAM_FILES" | sort))"
    if [ -n "$CONFLICTS" ]; then
      echo "$CONFLICTS"
    else
      info "  (none detected)"
    fi
  fi
  info ""
  info "Run without --dry-run to apply the merge."
  exit 0
fi

# ---------------------------------------------------------------------------
# Merge upstream into security-hardened branch
# ---------------------------------------------------------------------------
if [ "$BEHIND" -gt 0 ]; then
  info "Merging upstream into $PATCHED_BRANCH..."
  if ! git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit -m "merge: Incorporate upstream changes into security-hardened branch"; then
    error ""
    error "MERGE CONFLICT detected."
    error ""
    error "Resolve conflicts manually, then run:"
    error "  cd $SRC_DIR"
    error "  git add -A && git commit"
    error "  ./update-plugin.sh --force"
    error ""
    error "To abort the merge:"
    error "  git merge --abort"
    exit 1
  fi
  info "Merge successful."
fi

# ---------------------------------------------------------------------------
# Rebuild
# ---------------------------------------------------------------------------
info "Installing dependencies..."
npm install || die "npm install failed"

info "Building project..."
npm run build || die "npm run build failed"

info "Running tests..."
if npx vitest run --reporter=dot 2>&1 | tail -5; then
  info "Tests passed."
else
  warn "Some tests failed. Review output above."
  if [ "$FORCE" = false ]; then
    die "Fix test failures before deploying. Use --force to deploy anyway."
  fi
fi

# ---------------------------------------------------------------------------
# Deploy to plugin cache
# ---------------------------------------------------------------------------
info "Deploying to plugin cache at $CACHE_DIR..."

# Backup current cache
BACKUP_DIR="${CACHE_DIR}.backup.$(date +%Y%m%d%H%M%S)"
if [ -d "$CACHE_DIR" ]; then
  info "Backing up current cache to $BACKUP_DIR..."
  cp -r "$CACHE_DIR" "$BACKUP_DIR"
fi

# Copy runtime directories
for dir in "${RUNTIME_DIRS[@]}"; do
  if [ -d "$SRC_DIR/$dir" ]; then
    rm -rf "$CACHE_DIR/$dir"
    cp -r "$SRC_DIR/$dir" "$CACHE_DIR/$dir"
  fi
done

# Copy runtime files
for f in "${RUNTIME_FILES[@]}"; do
  if [ -f "$SRC_DIR/$f" ]; then
    cp "$SRC_DIR/$f" "$CACHE_DIR/$f"
  fi
done

info "Deploy complete."

# ---------------------------------------------------------------------------
# Update version in plugin.json if changed
# ---------------------------------------------------------------------------
NEW_VERSION="$(node -e "console.log(require('./package.json').version)")"
if [ "$NEW_VERSION" != "$PLUGIN_VERSION" ]; then
  info "Version changed: $PLUGIN_VERSION -> $NEW_VERSION"
  info "NOTE: Update PLUGIN_VERSION in this script and the cache path if needed."
  info "      You may need to update installed_plugins.json as well."
fi

# ---------------------------------------------------------------------------
# Cleanup old backups (keep last 3)
# ---------------------------------------------------------------------------
BACKUP_PATTERN="${CACHE_DIR}.backup.*"
BACKUP_COUNT="$(ls -d $BACKUP_PATTERN 2>/dev/null | wc -l)"
if [ "$BACKUP_COUNT" -gt 3 ]; then
  info "Cleaning old backups (keeping 3 most recent)..."
  ls -dt $BACKUP_PATTERN | tail -n +4 | xargs rm -rf
fi

info ""
info "Update complete. Restart Claude Code to pick up changes."
