# Mr. Luke's Teachings in Spelling and Technology

An original, offline first-person "edutainment horror" fan game in the spirit of the genre, with no assets, names, sprites or sounds from any existing game. All art is drawn with canvas in code and every sound effect is made with WebAudio.

## Run
Open `www/index.html` directly in Chrome or Edge (file:// works; no server and no internet needed). Three.js r149 (`www/lib/three.min.js`, MIT, license alongside) is loaded as a classic script, so there are no ES modules and no CDN.

## Wrapping later
- **Android (Samsung A72, landscape):** use Capacitor or Cordova with `www/` as the web dir. Set orientation to `landscape` (Cordova: `<preference name="Orientation" value="landscape"/>`; Capacitor: `android:screenOrientation="sensorLandscape"` on the activity) and enable fullscreen/immersive. Voice files go in `www/assets/voice/`.
- **Windows exe:** Electron or NW.js loading `www/index.html`.

## Layout
- `www/index.html`: UI screens and HUD
- `www/css/style.css`
- `www/js/textures.js`: procedural textures and character sprites (Mr. Luke, Principal Grant, Skippy, Broom Bot, Byte, iPads, items)
- `www/js/world.js`: school layout (37x29 grid: 14 rooms, halls, doors, 4 exits) and merged low-poly geometry
- `www/js/audio.js`: WebAudio sound effects, escape drone, optional voice-line system (see `VOICE.md`)
- `www/js/questions.js`: spelling and technology question banks, plus glitched questions
- `www/js/game.js`: game loop, player, AI, quiz, items, escape sequence, input, menus
- `tools/test.py`, `tools/test2.py`: headless Playwright and Chromium tests that write screenshots to `out/`

## Controls
PC: WASD move, mouse look (click to lock the pointer), Shift run, E or left-click to use, Q or right-click to use an item, 1-3 or the wheel to pick an item slot, M for the map, Esc or P to pause.
Touch: left-side virtual stick, drag on the right side to look, RUN (toggle), USE, ITEM, tap a slot to select it, II to pause.
