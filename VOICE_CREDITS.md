# Voice credits

## Mr. Luke: Araz's own voice (v1.1)

All of Mr. Luke's lines (`intro`, `notebook_1`–`7`, `correct`, `wrong`, `chase_start`, `caught`, `win`,
`exit_start`, `exit_1`–`3`) are **Araz Jafari's own voice**, used with his consent. He recorded a 14.6 s
reference clip; each line was first spoken neutrally by Piper `en_US-bryce-medium` (public domain) and then
converted into Araz's timbre with **Chatterbox VC** by Resemble AI (code and weights MIT licence,
https://github.com/resemble-ai/chatterbox, https://huggingface.co/ResembleAI/chatterbox). Chatterbox embeds
an inaudible Perth watermark in its output (marks it as AI-generated). Recipe: `tools/clone_voice.py`;
list of these files: `tools/voice_cloned.txt` (they are not in `voice_generated.txt`, so `gen_voice.py`
never overwrites them). The chase/escape lines get a light menacing treatment (tempo 0.95, pitch 0.96,
echo), not a big pitch drop, so they still sound like him.

Bonus clips `bonus_*.ogg` are Araz's original, unconverted recording ("Come back away!", "You give back!",
"Say no more!", "Now I will do this.", "Now while you can do it!"); `bonus_say_no_more` and
`bonus_now_while_you_can_do_it` play at random when Mr. Luke speeds up after another wrong iPad.

(OpenVoice V2's tone-colour converter, MIT, was tried first but barely moved the speaker similarity, so it was not used.)

## Principal Grant and Skippy (Piper)

These voice lines are AI placeholder voices, generated offline with
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
| Mr. Luke (all lines) | replaced by Araz's own voice (see above); Bryce was only the neutral source for the conversion | — | — |
| Principal Grant | `en_US-john-medium` | Public domain (LibriVox recordings; fine-tuned from the public-domain "kristin" voice) | pitch ×0.84, low-end boost |
| Skippy | `en_US-libritts_r-medium`, speaker 100 | **CC BY 4.0** (LibriTTS-R, http://www.openslr.org/141/) | faster (0.92), pitch ×1.28 |

Attribution required by CC BY 4.0 (Skippy):
"Skippy's voice was generated with the Piper `en_US-libritts_r-medium` model, trained on LibriTTS-R
(Koizumi et al., 2023, http://www.openslr.org/141/), licensed CC BY 4.0. Modified (pitch and speed)."

Model source: https://huggingface.co/rhasspy/piper-voices (each voice folder has a MODEL_CARD).
Put this credit in the game's About/Credits screen or store listing.
