# Voice credits

The voice lines in `www/assets/voice/*.ogg` are AI placeholder voices, generated offline with
**Piper TTS** (`piper-tts` 1.8.0, https://github.com/OHF-Voice/piper1-gpl) and post-processed with
ffmpeg (pitch shift via rubberband, echo, silence trim, EBU R128 loudness normalisation, Opus mono 48 kbps).
Regenerate with `python3 tools/gen_voice.py --models <dir with the .onnx files>`; it never overwrites
your own recordings (any file not listed in `tools/voice_generated.txt` is kept).

The Piper program is GPL-3.0; it is only a tool used to make the audio and is not shipped in the game.
Voice models were picked only from those whose training data is public domain or CC BY. Voices with
non-commercial or research-only data (en_US-ryan: CC BY-NC-SA 4.0; en_US-lessac: Blizzard research
licence; hfc_male/female: CC BY-NC-SA) were deliberately **not** used.

| Character | Piper voice model | Training-data licence (per the model card) | Processing |
|---|---|---|---|
| Mr. Luke (normal lines) | `en_US-bryce-medium` | Public domain (Bryce Beattie's own recordings; https://brycebeattie.com/files/tts/) | slower (length 1.12), pitch ×0.90 |
| Mr. Luke (chase_start, caught, exit_start, exit_1–3) | `en_US-bryce-medium` | Public domain | slower (1.15), pitch ×0.80, double echo |
| Principal Grant | `en_US-john-medium` | Public domain (LibriVox recordings; fine-tuned from the public-domain "kristin" voice) | pitch ×0.84, low-end boost |
| Skippy | `en_US-libritts_r-medium`, speaker 100 | **CC BY 4.0** (LibriTTS-R, http://www.openslr.org/141/) | faster (0.92), pitch ×1.28 |

Attribution required by CC BY 4.0 (Skippy):
"Skippy's voice was generated with the Piper `en_US-libritts_r-medium` model, trained on LibriTTS-R
(Koizumi et al., 2023, http://www.openslr.org/141/), licensed CC BY 4.0. Modified (pitch and speed)."

Model source: https://huggingface.co/rhasspy/piper-voices (each voice folder has a MODEL_CARD).
Put this credit in the game's About/Credits screen or store listing.
