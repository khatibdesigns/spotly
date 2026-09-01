# 🎙️ Spotly Teaser 01 — ElevenLabs VO Sheet

ElevenLabs = paste the **text**, shape with **voice + settings** (no "prompt").

## Settings (set once)
- **Model:** Eleven **Multilingual v2** (reliable + Arabic-capable)
- **Voice:** warm & soft. EN → **Sarah / Charlotte / Alice / Matilda** (female) or **Liam** (soft male). AR → preview a few multilingual voices, pick the most natural in Arabic.
- **Stability ~45%** · **Similarity ~80%** · **Style ~25%** · **Speed ~0.92**
- Keep the **`…`** — they create the pauses.

## English → save each as en-1.mp3 … en-4.mp3
- **en-1:** Another weekend… already.
- **en-2:** One tap… and the whole day's planned — for your kids, and the weather.
- **en-3:** Every outing… a memory you keep.
- **en-4:** Spotly. Coming soon.

## Arabic (Khaleeji) → save each as ar-1.mp3 … ar-4.mp3
- **ar-1:** ويكند ثاني… ووين نوديهم؟
- **ar-2:** بضغطة وحدة… يومكم كله مرتّب، على مزاج العيال وعلى الجو.
- **ar-3:** كل طلعة… ذكرى تبقى.
- **ar-4:** سبوتلي… قريبًا.

## After generating
1. You'll have **8 mp3s**.
2. Put them in **~/Desktop/Spotly Teaser 01/**.
3. Tell Claude "VO files are in" → it swaps them for the robotic voices, re-ducks the music, and re-exports `EN-VO` / `AR-VO`.

### Tips
- Generate **one line at a time** (so each is a clean, separately-placeable file).
- If a voice mispronounces an Arabic word, respell it phonetically and regenerate.
- For Arabic especially, a **real Kuwaiti voice** (phone recording) beats any TTS — send a voice note and it can be laid in instead.
- Timestamps the files land on: en-1/ar-1 ≈ 0.5s · en-2/ar-2 ≈ 4.7s · en-3/ar-3 ≈ 13.5s · en-4/ar-4 ≈ 16.6s (Claude handles this).
