#!/usr/bin/env bash
#
# Unix-style: pack context, format as a prompt, pipe to a model.
# Demo uses curl to a hypothetical chat API — swap in claude / openai / etc.

set -euo pipefail

TASK="${1:-fix the login validation bug}"
REPO="${2:-$(pwd)}"
BUDGET="${BUDGET:-4000}"

# 1. Pack
CONTEXT=$(mcx pack "$TASK" \
  --repo "$REPO" \
  --budget "$BUDGET" \
  --format markdown \
  --cache \
  --exclude "node_modules/**" "dist/**" "tests/**")

# 2. Compose the prompt
PROMPT=$(cat <<PROMPT_END
You are a senior engineer.  Use the context below to plan a fix.

TASK: $TASK

CONTEXT:
$CONTEXT
PROMPT_END
)

# 3. (Example) send to a model.  Replace with your provider.
#    The line below is illustrative — uncomment + set ANTHROPIC_API_KEY to run.
#
# curl https://api.anthropic.com/v1/messages \
#   -H "x-api-key: $ANTHROPIC_API_KEY" \
#   -H "anthropic-version: 2023-06-01" \
#   -H "content-type: application/json" \
#   -d "$(jq -n --arg p "$PROMPT" '{model: "claude-3-5-sonnet-20241022", max_tokens: 4000, messages: [{role: "user", content: $p}]}')"

# For now just print:
echo "$PROMPT"
