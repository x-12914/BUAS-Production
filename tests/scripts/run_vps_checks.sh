#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-quick}"
BASE_URL="${TEST_BASE_URL:-http://127.0.0.1:5000}"
REPORT_DIR="tests/reports"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${REPORT_DIR}/${MODE}_${TIMESTAMP}.log"

if [[ $# -gt 0 ]]; then
  shift
fi

mkdir -p "${REPORT_DIR}"

echo "[INFO] Mode: ${MODE}" | tee -a "${LOG_FILE}"
echo "[INFO] Base URL: ${BASE_URL}" | tee -a "${LOG_FILE}"

if [[ "${MODE}" == "quick" ]]; then
  MARK_EXPR="quick"
elif [[ "${MODE}" == "full" ]]; then
  MARK_EXPR="quick or full"
elif [[ "${MODE}" == "release" ]]; then
  MARK_EXPR="quick or full or heavy"
else
  echo "[ERROR] Unknown mode: ${MODE}. Use quick|full|release" | tee -a "${LOG_FILE}"
  exit 1
fi

echo "[INFO] Running pytest marker expression: ${MARK_EXPR}" | tee -a "${LOG_FILE}"
python -m pytest -m "${MARK_EXPR}" -q --base-url "${BASE_URL}" "$@" 2>&1 | tee -a "${LOG_FILE}"

echo "[INFO] Completed. Log: ${LOG_FILE}" | tee -a "${LOG_FILE}"
