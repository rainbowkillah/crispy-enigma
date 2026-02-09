#!/usr/bin/env bash
#
# align-nx-issues.sh - Bulk assign NX sub-issues to milestones and project
#
# This script aligns NX-1 through NX-4 sub-issues with their parent milestones
# and adds them to the GitHub Project.
#
# Prerequisites:
# - GitHub CLI (gh) installed and authenticated
# - Repository: rainbowkillah/crispy-enigma
# - Permissions: write access to issues and projects
#
# Usage:
#   ./scripts/align-nx-issues.sh [--dry-run]
#
# Options:
#   --dry-run    Show what would be done without making changes
#

set -euo pipefail

# Configuration
REPO="rainbowkillah/crispy-enigma"
PROJECT_URL="https://github.com/users/rainbowkillah/projects/13"
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--dry-run]"
      exit 1
      ;;
  esac
done

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
if ! command -v gh &> /dev/null; then
  log_error "GitHub CLI (gh) is not installed. Please install it first."
  exit 1
fi

# Verify authentication
if ! gh auth status &> /dev/null; then
  log_error "Not authenticated with GitHub CLI. Run 'gh auth login' first."
  exit 1
fi

log_info "Starting NX issues alignment..."
if [ "$DRY_RUN" = true ]; then
  log_warning "DRY RUN MODE - No changes will be made"
fi

# Define issue-to-milestone mappings
declare -A MILESTONES
MILESTONES["NX-1"]="NX-1: Bootstrap"
MILESTONES["NX-2"]="NX-2: Worker Gen"
MILESTONES["NX-3"]="NX-3: Tenant Gen"
MILESTONES["NX-4"]="NX-4: Bindings"

# NX-1: Bootstrap issues
NX1_ISSUES=(141 143 144 145 146 147 149 150 151 152 153 154 155 156 157 158 160 161 162 163 165 166 167 168)

# NX-2: Worker Gen issues
NX2_ISSUES=(159 174 176 179 182 185 188 191 194 197 200 202 205 209 213 215 217 221 224 227)

# NX-3: Tenant Gen issues
NX3_ISSUES=(148 173 177 180 183 186 189 192 195 198 201 204 206 208 211 214 218 220 223 226)

# NX-4: Bindings issues
NX4_ISSUES=(164 171 172 175 178 181 184 187 190 193 196 199 203 207 210 212 216 219 222 225 228 229 230 231 232 233 234 235 236 237 238 239)

# Parent issues that should also be in the project
PARENT_ISSUES=(18 20 21 22 23 26 27 28 29 30 31 32 34 36 37 40 41)

# Function to assign milestone to issue
assign_milestone() {
  local issue=$1
  local milestone=$2
  
  if [ "$DRY_RUN" = true ]; then
    log_info "[DRY-RUN] Would assign issue #${issue} to milestone '${milestone}'"
  else
    log_info "Assigning issue #${issue} to milestone '${milestone}'..."
    if gh issue edit "$issue" --repo "$REPO" --milestone "$milestone" 2>/dev/null; then
      log_success "  ✓ Issue #${issue} assigned to milestone"
    else
      log_warning "  ⚠ Failed to assign issue #${issue} (may already be assigned or not exist)"
    fi
  fi
}

# Function to add issue to project
add_to_project() {
  local issue=$1
  
  if [ "$DRY_RUN" = true ]; then
    log_info "[DRY-RUN] Would add issue #${issue} to project"
  else
    log_info "Adding issue #${issue} to project..."
    # Note: This requires the project URL or ID
    # The command may vary based on GitHub CLI version
    if gh project item-add 13 --owner rainbowkillah --url "https://github.com/$REPO/issues/$issue" 2>/dev/null; then
      log_success "  ✓ Issue #${issue} added to project"
    else
      log_warning "  ⚠ Failed to add issue #${issue} to project (may already be added)"
    fi
  fi
}

# Process NX-1 issues
log_info ""
log_info "Processing NX-1: Bootstrap (${#NX1_ISSUES[@]} issues)..."
for issue in "${NX1_ISSUES[@]}"; do
  assign_milestone "$issue" "${MILESTONES[NX-1]}"
  add_to_project "$issue"
done

# Process NX-2 issues
log_info ""
log_info "Processing NX-2: Worker Gen (${#NX2_ISSUES[@]} issues)..."
for issue in "${NX2_ISSUES[@]}"; do
  assign_milestone "$issue" "${MILESTONES[NX-2]}"
  add_to_project "$issue"
done

# Process NX-3 issues
log_info ""
log_info "Processing NX-3: Tenant Gen (${#NX3_ISSUES[@]} issues)..."
for issue in "${NX3_ISSUES[@]}"; do
  assign_milestone "$issue" "${MILESTONES[NX-3]}"
  add_to_project "$issue"
done

# Process NX-4 issues
log_info ""
log_info "Processing NX-4: Bindings (${#NX4_ISSUES[@]} issues)..."
for issue in "${NX4_ISSUES[@]}"; do
  assign_milestone "$issue" "${MILESTONES[NX-4]}"
  add_to_project "$issue"
done

# Add parent issues to project
log_info ""
log_info "Adding parent issues to project (${#PARENT_ISSUES[@]} issues)..."
for issue in "${PARENT_ISSUES[@]}"; do
  add_to_project "$issue"
done

# Summary
log_info ""
log_info "═════════════════════════════════════════════════════════════"
log_success "Alignment complete!"
log_info "═════════════════════════════════════════════════════════════"
log_info "Summary:"
log_info "  - NX-1 issues: ${#NX1_ISSUES[@]}"
log_info "  - NX-2 issues: ${#NX2_ISSUES[@]}"
log_info "  - NX-3 issues: ${#NX3_ISSUES[@]}"
log_info "  - NX-4 issues: ${#NX4_ISSUES[@]}"
log_info "  - Parent issues: ${#PARENT_ISSUES[@]}"
log_info "  - Total issues processed: $((${#NX1_ISSUES[@]} + ${#NX2_ISSUES[@]} + ${#NX3_ISSUES[@]} + ${#NX4_ISSUES[@]} + ${#PARENT_ISSUES[@]}))"
log_info ""
log_info "Next steps:"
log_info "  1. Verify milestone assignments: gh issue list --milestone 'NX-1: Bootstrap'"
log_info "  2. Check project: ${PROJECT_URL}"
log_info "  3. Review alignment report: docs/NX-ISSUES-ALIGNMENT.md"
log_info ""

if [ "$DRY_RUN" = true ]; then
  log_warning "This was a DRY RUN. Run without --dry-run to apply changes."
fi
