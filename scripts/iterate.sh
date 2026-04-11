#!/usr/bin/env bash
# 一键迭代脚本：replay 一次已录制会话 + 打印紧凑报告。
#
# 用法:
#   ./scripts/iterate.sh <session_name_or_id> [reference_csv]
#
# 示例:
#   ./scripts/iterate.sh 正方形2 scripts/reference_正方形.csv
#   ./scripts/iterate.sh 5                      # 按 id
#
# Claude Code 的调用模式：改 processor.toml → 跑本脚本 → 读 stdout 报告。
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "用法: $0 <session_name_or_id> [reference_csv]" >&2
    exit 1
fi

SESSION="$1"
REF="${2:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/src-tauri"

# Release 构建更快、与在线管线时间行为更接近。首次会编译，后续增量。
REPLAY_ARGS=(--session "$SESSION")
if [[ -n "$REF" ]]; then
    # 支持绝对或项目根相对路径
    if [[ "$REF" = /* ]]; then
        REPLAY_ARGS+=(--reference "$REF")
    else
        REPLAY_ARGS+=(--reference "$ROOT/$REF")
    fi
fi

exec cargo run --release --quiet --bin replay -- "${REPLAY_ARGS[@]}"
