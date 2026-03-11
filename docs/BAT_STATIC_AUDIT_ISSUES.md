# BAT Static Audit Issues

Date: 2026-03-11  
Scope: Read-only static audit of `Bat` module and related backend contracts (no code changes).

Update: 2026-03-11 (same session)  
Issues 2, 3, 4, and 5 were implemented in BAT code after this audit.

## Revalidation Note (BUAS Crosscheck)

This document was revalidated against current BUAS backend routes and docs before any fixes.

Classification used:
- **Confirmed Now**: actionable issue with direct evidence in active flow.
- **Conditional**: present mismatch/debt but not proven on active runtime path.
- **Debt/Design Risk**: not necessarily broken now, but likely to cause maintenance/runtime issues.

## Summary

This document captures issues found during static crosscheck without Gradle build execution.

## Implementation Status (Applied)

- ✅ Issue 2 implemented: removed unsupported BAT `device-summary` upload path and removed unused `FileUploadManager`.
- ✅ Issue 3 implemented: removed typed `device-data/<deviceId>/<dataType>` upload wrappers from `DataUploadManager`.
- ✅ Issue 4 implemented: removed legacy `MediaRecorder` path (`startRecordingInternal`, `verifyRecordingIsWorking`, `checkRecordingProgress`) and updated remaining checks to manager-based state.
- ✅ Issue 5 implemented: renamed app SMS helper class to `BatSmsManager` and aliased framework import (`android.telephony.SmsManager as AndroidSmsManager`).
- ✅ Static validation: no Kotlin errors reported by workspace diagnostics in edited BAT files.

## Findings

### 1) Compile Blocker: Out-of-scope variable in `MainActivity.kt`  
**Status: Confirmed Now**

- File: `Bat/app/src/main/java/com/animal/bat/MainActivity.kt`
- Location: around lines 194-205
- Issue:
  - `intent` is declared inside a `try` block and then referenced inside `catch`.
  - The `catch` block call `startActivity(intent)` can fail compilation due to variable scope.
- Impact: High (build can fail)

### 2) API Contract Mismatch: `device-summary` endpoint missing on backend
**Status: Confirmed Now**

- BAT caller:
  - File: `Bat/app/src/main/java/com/animal/bat/FileUploadManager.kt`
  - Location: around line 43
  - Calls: `/api/upload/device-summary/{deviceId}`
- Backend routes:
  - File: `app/routes.py`
  - Result: no matching `/api/upload/device-summary/...` route found
- Active usage confirmation:
  - File: `Bat/app/src/main/java/com/animal/bat/PersistentForegroundService.kt`
  - `uploadDeviceSummary(...)` is called in live service flow.
- Impact: High (runtime request failure)

### 3) API Contract Mismatch: typed device-data endpoint mismatch
**Status: Conditional**

- BAT caller:
  - File: `Bat/app/src/main/java/com/animal/bat/DataUploadManager.kt`
  - Location: around line 98
  - Calls: `/api/upload/device-data/{deviceId}/{dataType}`
- Backend route:
  - File: `app/routes.py`
  - Location: around line 3884
  - Exposes: `/api/upload/device-data/<device_id>` only
- Active flow check:
  - Current comprehensive upload flow calls `uploadDeviceData(...)` (single endpoint shape), which aligns with backend.
  - Typed `.../<dataType>` method exists and is mismatched, but not confirmed as active in current runtime path.
- Impact: High (runtime request failure for typed uploads)

### 4) Service Complexity Risk: dual recording paths in `PersistentForegroundService.kt`
**Status: Debt/Design Risk**

- File: `Bat/app/src/main/java/com/animal/bat/PersistentForegroundService.kt`
- Active path:
  - `startRecordingWithManager(...)` around line 880
- Legacy path still present:
  - `startRecordingInternal()` around line 910
  - `verifyRecordingIsWorking()` around line 1042
  - `checkRecordingProgress()` around line 1090
- Issue:
  - Co-existence of manager-based and legacy recorder logic increases drift risk and stale state interactions.
- Impact: Medium-High (maintenance and behavior inconsistency risk)

### 5) Naming Collision Risk: app `SmsManager` vs Android `SmsManager`
**Status: Debt/Design Risk (potential compile/symbol confusion)**

- App class:
  - File: `Bat/app/src/main/java/com/animal/bat/SmsManager.kt`
  - Declaration around line 25
- Android class import present in multiple files:
  - Example: `Bat/app/src/main/java/com/animal/bat/PhoneNumberManager.kt` line ~7
- Issue:
  - Same class name as Android framework `android.telephony.SmsManager` can cause confusion and accidental misuse.
- Impact: Medium (developer error risk)

## Safe-to-Change Verdicts (Issues 2-5)

This section answers whether each item is safe to remove/change, based on static call graph checks in BAT and route checks in BUAS backend.

### Issue 2 (`device-summary` endpoint mismatch)
- **Verdict:** Safe to remove BAT `device-summary` path.
- **Evidence:**
  - Only one active callsite: `PersistentForegroundService.uploadDeviceInfo()` -> `fileUploadManager.uploadDeviceSummary(...)`.
  - No backend route exists for `/api/upload/device-summary/<device_id>`.
  - Core device metadata already uploads via `/api/upload/device-info/<device_id>`.
- **Risk if removed:** Low. Loss is only the extra summary attempt; primary sync path remains.

### Issue 3 (typed `/device-data/<deviceId>/<dataType>` mismatch)
- **Verdict:** Safe to remove typed wrapper methods in `DataUploadManager`.
- **Evidence:**
  - `uploadSpecificData`, `uploadCallLogsData`, `uploadContactsData`, `uploadSmsData`, `uploadAppData` are definition-only in current BAT code.
  - Active service flow uses `dataUploadManager.uploadDeviceData(...)` (comprehensive endpoint), which matches backend.
  - Backend exposes `/api/upload/device-data/<device_id>` only.
- **Risk if removed:** Low, as long as `uploadDeviceData(...)` is retained.

### Issue 4 (dual recording paths)
- **Verdict:** Safe to remove legacy `MediaRecorder` path **only as a coordinated cleanup**, not by deleting one method in isolation.
- **Evidence:**
  - `startRecordingInternal()` has no external callsites; `startRecording()` delegates to `startRecordingWithManager(...)`.
  - `verifyRecordingIsWorking()` and `checkRecordingProgress()` are only chained from `startRecordingInternal()`.
  - However, legacy state (`mediaRecorder`) is still referenced in call-state handling and `onDestroy` cleanup.
- **Risk if removed naively:** Medium. Must remove/update all legacy references together.

### Issue 5 (`SmsManager` naming collision)
- **Verdict:** Not safe to remove app `SmsManager` class; safe to rename/refactor it.
- **Evidence:**
  - App `SmsManager` is actively used by `PersistentForegroundService` and `TriggerReceiver` for SMS monitoring/upload/sending.
  - `PhoneNumberManager` independently uses Android framework `android.telephony.SmsManager`.
  - In `SmsManager.kt`, importing Android `SmsManager` and defining app class `SmsManager` creates high symbol-confusion risk.
- **Risk if removed:** High (breaks SMS features). Recommended action is rename app class (e.g., `BatSmsManager`) and alias framework import.

### Confidence Note
- Confidence is high for static reachability and route-contract statements.
- Runtime certainty still requires local BAT build/run after Java/SDK toolchain is restored.

## Audit Constraints

- Gradle compile/build diagnostics could not be executed in this environment due to missing Java toolchain (`JAVA_HOME` not set).
- Findings above are static-analysis based and should still be treated as actionable.

## Recommended Next Actions (No code changes yet)

1. Fix `MainActivity.kt` scope error first (build blocker).
2. Align BAT upload URLs with actual backend routes (or add missing backend routes).
3. Decide whether typed `device-data/<type>` uploads are needed; remove or align if kept.
4. Decide one recording path strategy in `PersistentForegroundService.kt` to reduce drift.
5. Consider renaming app `SmsManager` to avoid framework name collision.

## BUAS Route/Doc Crosscheck Snapshot

- Present on backend: `POST /api/upload/device-data/<device_id>`
- Not found on backend: `POST /api/upload/device-summary/<device_id>`
- External storage removal docs indicate non-storage upload flow should remain active.
