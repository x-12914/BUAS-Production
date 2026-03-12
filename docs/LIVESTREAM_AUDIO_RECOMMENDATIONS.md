# Livestream Audio Quality Recommendations

## Goal
Improve intelligibility of livestream audio (voice clarity) while minimizing battery, latency, and bandwidth regressions.

---

## Recommended Changes (Ranked)

### Tier 1: Recommended to implement now (1-3)

Status: Selected for immediate implementation.

1) Increase Opus codec complexity (BAT)
- File: Bat/app/src/main/java/com/animal/bat/LiveAudioStreamer.kt
- Change: KEY_COMPLEXITY = 8 -> 10
- Why: Higher compression quality without added bandwidth; low risk.

2) Increase audio queue capacity (BAT)
- File: Bat/app/src/main/java/com/animal/bat/LiveAudioStreamer.kt
- Change: LinkedBlockingQueue size 50 -> 100
- Why: Reduces dropouts caused by jitter or bursty delivery. Memory impact is negligible.

3) Add diagnostic logging (BAT, backend, frontend)
- Files:
  - Bat/app/src/main/java/com/animal/bat/LiveAudioStreamer.kt
  - app/streaming.py
  - frontend/src/components/LiveAudioPlayer.js
- Why: Proves whether problems are caused by packet loss, queue drops, or frontend underruns. Avoids guessing and prevents wasteful changes.

---

## Conditional Changes (Implement only if diagnostics indicate)

4) Increase Opus bitrate (BAT)
- File: Bat/app/src/main/java/com/animal/bat/LiveAudioStreamer.kt
- Change: BIT_RATE = 48000 -> 64000 (or 80000)
- Why: Higher bitrate improves clarity in noisy environments.
- Tradeoff: +33% to +67% bandwidth and more CPU.

5) Add noise suppressor toggle (BAT)
- File: Bat/app/src/main/java/com/animal/bat/LiveAudioStreamer.kt
- Change: Make NoiseSuppressor optional via config flag.
- Why: On some devices it suppresses speech; a toggle allows field testing.
- Tradeoff: Disabling may increase background noise.

---

## Devil's Advocate (Counterpoints)

- "Complexity increase is too small to matter."
  - Response: It is a free quality gain; even 5-10% is worth it with no bandwidth impact.

- "Queue increase just adds latency."
  - Response: Queue size buffers jitter; actual latency is driven by playback scheduling and packet delivery. The added memory is minimal and prevents dropouts.

- "Bitrate should be raised immediately."
  - Response: If packet loss or suppression is the real issue, higher bitrate can make quality worse by increasing loss. Diagnostics first avoid regressions.

- "Noise suppression should always be disabled."
  - Response: It can help in many environments; disabling globally can make audio worse indoors. A toggle is safer and evidence-based.

---

## Conclusion

Implement Tier 1 (items 1-3) immediately. These changes are low risk, measurable, and likely to improve clarity without major tradeoffs. Use the diagnostics to determine whether Tier 2 changes (bitrate increase or suppression toggle) are justified. Avoid device-specific workarounds unless field reports confirm a specific device issue.

---

## Suggested Validation

1) Baseline: record a 60-second sample with current settings.
2) Apply Tier 1 changes and re-test in the same conditions.
3) Compare:
- Queue drop count
- Packet loss percentage
- Frontend underruns
- Subjective clarity (MOS score 1-5)
4) If clarity is still low, increase bitrate or add noise suppressor toggle based on diagnostics.
