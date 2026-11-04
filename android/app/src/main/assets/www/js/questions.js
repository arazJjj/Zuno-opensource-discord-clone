/* Question banks: spelling + basic technology. Answers are compared case-insensitively, ignoring spaces/punctuation. */
(function () {
  'use strict';
  const LG = window.LG;
  const fix = [['recieve', 'receive'], ['definately', 'definitely'], ['seperate', 'separate'], ['neccessary', 'necessary'], ['adress', 'address'], ['begining', 'beginning'], ['wierd', 'weird'], ['tommorow', 'tomorrow'], ['enviroment', 'environment'], ['libary', 'library'], ['freind', 'friend'], ['beleive', 'believe'], ['calender', 'calendar'], ['untill', 'until'], ['acheive', 'achieve'], ['truely', 'truly'], ['computor', 'computer'], ['pasword', 'password'], ['keybord', 'keyboard'], ['wensday', 'wednesday'], ['scool', 'school'], ['teecher', 'teacher'], ['becuase', 'because'], ['speling', 'spelling']];
  const scramble = [['SUOME', 'mouse'], ['TINREPR', 'printer'], ['RENECS', 'screen'], ['DOCE', 'code'], ['MAGRPOR', 'program'], ['TOREUR', 'router'], ['LIFE (a computer thing)', 'file'], ['DLOREF', 'folder'], ['TYBE', 'byte'], ['DIAP', 'ipad'], ['PLATOP', 'laptop'], ['BEWSITE', 'website'], ['ROTINOM', 'monitor'], ['ILAME', 'email']];
  const tech = [
    ['How many bits are in one byte?', ['8', 'eight']],
    ['CPU stands for Central ______ Unit', ['processing']],
    ['RAM stands for Random ______ Memory', ['access']],
    ['Keyboard shortcut to COPY is Ctrl + ?', ['c']],
    ['Keyboard shortcut to PASTE is Ctrl + ?', ['v']],
    ['Keyboard shortcut to UNDO is Ctrl + ?', ['z']],
    ['Keyboard shortcut to SAVE is Ctrl + ?', ['s']],
    ['The number 10 in binary equals what in normal numbers?', ['2', 'two']],
    ['The number 101 in binary equals what in normal numbers?', ['5', 'five']],
    ['Which key do you hold to type a CAPITAL letter?', ['shift']],
    ['In "WWW", the first W stands for...', ['world']],
    ['The opposite of download is...', ['upload']],
    ['A fake email that tries to steal passwords is called...', ['phishing']],
    ['A number system that only uses 0 and 1 is called...', ['binary']],
    ['Web pages are written in H _ _ _ (type the 4 letters)', ['html']],
    ['Which is bigger: 1 GB or 1 MB? (type gb or mb)', ['gb']],
    ['The U in USB stands for...', ['universal']],
    ['What do you click and move with your hand? (a small animal name)', ['mouse']],
    ['How many bytes in a kilobyte? (1000 or 1024)', ['1000', '1024']],
    ['A program that harms computers and spreads is a...', ['virus', 'malware', 'worm']],
    ['Tablet made by Apple with a big touch screen?', ['ipad']],
    ['What does Wi-Fi connect you to without a cable?', ['internet', 'network', 'theinternet']],
    ['8 + 8 in decimal equals? (computers love this number)', ['16', 'sixteen']]
  ];
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  LG.norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  function spelling() {
    if (Math.random() < 0.55) { const p = pick(fix); return { kind: 'Spelling', q: 'Fix the spelling:\n"' + p[0].toUpperCase() + '"', a: [p[1]] }; }
    const p = pick(scramble); return { kind: 'Spelling', q: 'Unscramble the tech word:\n' + p[0], a: [p[1]] };
  }
  function techQ() { const p = pick(tech); return { kind: 'Technology', q: p[0], a: p[1] }; }
  const Z = ['\u0336', '\u0337', '\u0338', '\u0335', '\u0334', '\u0352', '\u0353', '\u0354'];
  function zalgo(s) { return s.split('').map(function (c) { return c === ' ' || c === '\n' ? c : c + Z[(Math.random() * Z.length) | 0] + (Math.random() < 0.4 ? Z[(Math.random() * Z.length) | 0] : ''); }).join(''); }
  const glitchSrc = ['SPELL THE WORD: \u2593\u2592\u2591#@%&!\u2588', 'HOW MANY BYTES IN A L\u00b0U\u00b0K\u00b0E? 0x%%%', 'TYPE THE PASSWORD TO MY iPAD: ********', 'WHAT IS 4096 \u00d7 \u221e \u00f7 RULER =', 'UNSCRAMBLE: \u2591\u2591\u2591\u2591\u2591\u2591\u2591 (404)', 'FIX THE SPELLING: ERR0R_ERR0R_ERR0R'];
  LG.makeQuiz = function (glitchThird) {
    const q1 = Math.random() < 0.5 ? spelling() : techQ();
    let q2 = q1.kind === 'Spelling' ? techQ() : spelling();
    let q3 = glitchThird ? { kind: '???', q: zalgo(pick(glitchSrc)), a: [], glitch: true } : (Math.random() < 0.5 ? spelling() : techQ());
    while (!q3.glitch && (q3.q === q1.q || q3.q === q2.q)) q3 = Math.random() < 0.5 ? spelling() : techQ();
    return [q1, q2, q3];
  };
  LG.checkAnswer = function (q, ans) { if (q.glitch) return false; const n = LG.norm(ans); return q.a.some(function (x) { return LG.norm(x) === n; }); };
  LG.zalgo = zalgo;
})();
