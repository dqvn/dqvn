'use strict';

const MAX_OPTIONS    = 10;

let correctAnswers   = 0;
let currentWordIndex = 0;
let data             = [];
let recentGames      = [];
let maxNumber        = 15;

/* ═══════════════════════════════════════════════════════════
   GAME PROGRESS PERSISTENCE
   Stores which words have been seen per chapter in localStorage
   so the next session resumes from where the user left off.
   Key: nl_game_progress_v1  →  { "ch01": ["word1","word2",...] }
   ═══════════════════════════════════════════════════════════ */
const GAME_PROGRESS_KEY = 'nl_game_progress_v1';
let _loadedChapter      = null;   // which chapter's data is currently in recentGames

function _currentChapter() {
    try {
        const key = (typeof _storageKey !== 'undefined') ? _storageKey : 'curPage';
        return localStorage.getItem(key) || 'default';
    } catch { return 'default'; }
}

function _readProgress() {
    try { return JSON.parse(localStorage.getItem(GAME_PROGRESS_KEY)) || {}; }
    catch { return {}; }
}

function _writeProgress(p) {
    try { localStorage.setItem(GAME_PROGRESS_KEY, JSON.stringify(p)); } catch {}
}

function _loadSeenWords() {
    return (_readProgress()[_currentChapter()] || []).slice();
}

function _saveSeenWords(seen) {
    const ch = _currentChapter();
    const p  = _readProgress();
    if (seen.length === 0) { delete p[ch]; }    // clean up when fully reset
    else                   { p[ch] = seen; }
    _writeProgress(p);
}

/* Load progress for the active chapter into recentGames (once per chapter switch) */
function _ensureProgressLoaded() {
    const ch = _currentChapter();
    if (_loadedChapter !== ch) {
        recentGames    = _loadSeenWords();
        _loadedChapter = ch;
    }
}

/* Update the chapter header with seen / remaining counts */
function _updateProgressHeader() {
    const total     = wordList.filter(w => w?.english?.trim()).length;
    const seenNow   = recentGames.length;
    const remaining = Math.max(0, total - seenNow);
    const ch        = _currentChapter();
    const msg       = remaining > 0
        ? `(${ch}) &nbsp;·&nbsp; ${seenNow}/${total} words seen &nbsp;·&nbsp; ${remaining} left`
        : `(${ch}) &nbsp;·&nbsp; 🎉 All ${total} done! Starting over…`;
    document.getElementById('chapter').innerHTML = msg;
}

/* ═══════════════════════════════════════════════════════════
   AI STORY GENERATOR
   ═══════════════════════════════════════════════════════════ */
async function generateStoryFromPuter(dataObjects, questionDiv) {
    const words = dataObjects.map(item => item.dutch.split(',')[0].trim());
    try {
        const response = await puter.ai.chat(
            `Schrijf een kort Nederlands verhaal van 5 zinnen met deze woorden: ${words.join(', ')}.
                GEEF ALLEEN DE TEKST TERUG. GEEN MARKDOWN, GEEN TITEL, GEEN UITLEG EN GEEN QUOTES. Then end with translate the story to English and put in [ .. ].`,
            { model: 'gpt-5.2' }
        );
        const raw = response.message.content;
        const sep = raw.indexOf('[');
        if (sep > -1) {
            questionDiv.innerHTML = '';
            questionDiv.appendChild(document.createTextNode(raw.slice(0, sep).trimEnd()));
            questionDiv.appendChild(document.createElement('br'));
            questionDiv.appendChild(document.createElement('br'));
            questionDiv.appendChild(document.createTextNode(raw.slice(sep)));
        } else {
            questionDiv.textContent = raw;
        }
    } catch (error) {
        console.error('[Game] AI story error:', error);
    }
}

/* ═══════════════════════════════════════════════════════════
   CORE GAME LOGIC
   ═══════════════════════════════════════════════════════════ */
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/* Sequence counter — incremented whenever a new TTS chain starts.
   Each async showQuestion() captures its own value; if it no longer
   matches when it resumes after await, a newer call has taken over
   and the old chain exits without speaking the sentence. */
let _ttsSeq = 0;

async function showQuestion() {
    document.getElementById('popup').style.display = 'flex';
    document.body.classList.add('game-active');
    maxNumber = Math.min(15, wordList.length);

    if (!data || data.length === 0) {
        _ensureProgressLoaded();

        const prevSeenLen = recentGames.length;
        data = getRandomData(wordList, maxNumber);

        if (prevSeenLen > 0 && recentGames.length === 0) {
            _saveSeenWords([]);
        }

        _updateProgressHeader();
        generateStoryFromPuter(data, document.getElementById('question'));
    }

    if (currentWordIndex < maxNumber && currentWordIndex < data.length) {
        const currentWord = data[currentWordIndex];

        const options = [currentWord.english];
        while (options.length < Math.min(MAX_OPTIONS, data.length)) {
            const pick = data[Math.floor(Math.random() * data.length)].english;
            if (!options.includes(pick)) options.push(pick);
        }
        shuffle(options);

        document.getElementById('progress').textContent = `${currentWordIndex + 1} / ${maxNumber}`;
        const wordTitle = document.getElementById('game-container').querySelector('h1');
        wordTitle.textContent = currentWord.dutch;
        wordTitle.onclick = () => speakText(currentWord.dutch);

        const sentenceDiv = document.getElementById('sentence');
        if (sentenceDiv) {
            sentenceDiv.textContent = currentWord.dutchsentence;
            sentenceDiv.onclick     = () => {
                speakText(currentWord.dutchsentence);
                _showTranslationToast(currentWord.dutchsentence, currentWord.englishtranslate);
            };
        }

        document.getElementById('options').innerHTML  = '';
        const resultEl = document.getElementById('result');
        resultEl.textContent = '';
        resultEl.className   = '';
        _hideTranslationToast();

        const frag = document.createDocumentFragment();
        options.forEach((option, index) => {
            const btn       = document.createElement('button');
            btn.textContent = option;
            btn.onclick     = () => checkAnswer(option, currentWord.english);
            frag.appendChild(btn);
            if (index < options.length - 1) frag.appendChild(document.createElement('br'));
        });
        document.getElementById('options').appendChild(frag);

        // Speak word, wait for it to finish, then speak sentence.
        // If the user answers mid-speech, checkAnswer() bumps _ttsSeq and
        // cancels TTS — the await resolves immediately and we exit early.
        const mySeq = ++_ttsSeq;
        await speakTextAsync(currentWord.dutch);
        if (_ttsSeq !== mySeq) return;          // user already answered — stop chain
        if (currentWord.dutchsentence) {
            await speakTextAsync(currentWord.dutchsentence);
        }

    } else {
        showResult();
    }
}

async function checkAnswer(selectedOption, correctAnswer) {
    _ttsSeq++;
    window.speechSynthesis.cancel();
    await new Promise(r => setTimeout(r, 50));

    // Highlight selected button and reveal correct answer; disable all buttons
    document.querySelectorAll('#options button').forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === correctAnswer)  btn.classList.add('btn-correct');
        if (btn.textContent === selectedOption && selectedOption !== correctAnswer)
            btn.classList.add('btn-incorrect');
    });

    const resultEl = document.getElementById('result');
    if (selectedOption === correctAnswer) {
        correctAnswers++;
        if (!recentGames.includes(correctAnswer)) recentGames.push(correctAnswer);
        resultEl.textContent = '🎉 Correct!';
        resultEl.className   = 'result-correct';
        _showCorrectAnimation();
        await speakEngTextAsync('Correct: ' + correctAnswer);
    } else {
        resultEl.textContent = `❌ Incorrect — answer: ${correctAnswer}`;
        resultEl.className   = 'result-incorrect';
        await speakEngTextAsync('Incorrect. The correct answer is ' + correctAnswer);
    }
    currentWordIndex++;
    showQuestion();
}

function showResult() {
    const total = wordList.filter(w => w?.english?.trim()).length;

    // Mark ALL 15 played words as seen (correct + incorrect alike) so the
    // next session picks the next fresh batch, not the same words again.
    data.forEach(w => {
        if (w.english && !recentGames.includes(w.english)) recentGames.push(w.english);
    });
    _saveSeenWords(recentGames);             // persist before resetting data

    const seenNow = recentGames.length;
    document.getElementById('question').textContent = '';
    document.getElementById('options').innerHTML    = '';

    _showEndgameAnimation(correctAnswers, maxNumber, seenNow, total, () => {
        document.body.classList.remove('game-active');
        document.getElementById('popup').style.display = 'none';
        data             = [];
        correctAnswers   = 0;
        currentWordIndex = 0;
        document.getElementById('result').textContent = "Let's go!!!";
    });
}

/* ── End-of-game celebration overlay ────────────────────────────────────────
   Shows score card, animated counter, stars, chapter progress bar,
   falling confetti rain, and 3 firework bursts.
   Auto-dismisses after 5.5 s; tap anywhere to dismiss early.
   ──────────────────────────────────────────────────────────────────────── */
function _showEndgameAnimation(correct, maxN, seenNow, totalWords, onDone) {
    document.getElementById('endgame-overlay')?.remove();

    const pct   = maxN > 0 ? correct / maxN : 0;
    const trophy = pct >= 0.9 ? '🏆' : pct >= 0.7 ? '🥇' : pct >= 0.5 ? '🥈' : '🥉';
    const stars  = Math.round(pct * 5);
    const chPct  = totalWords > 0 ? Math.round((seenNow / totalWords) * 100) : 0;

    // ── Build overlay ──
    const overlay = document.createElement('div');
    overlay.id = 'endgame-overlay';

    const card = document.createElement('div');
    card.className = 'eg-card';
    card.innerHTML = `
        <span class="eg-trophy">${trophy}</span>
        <div class="eg-score-wrap">
            <div class="eg-score-label">Your Score</div>
            <div class="eg-score-number">
                <span class="eg-count">0</span><span class="eg-score-denom"> / ${maxN}</span>
            </div>
        </div>
        <span class="eg-stars">${[0,1,2,3,4].map(i =>
            `<span class="eg-star" style="animation-delay:${0.9 + i * 0.12}s">${i < stars ? '⭐' : '☆'}</span>`
        ).join('')}</span>
        <div class="eg-progress-label">Chapter progress: ${seenNow} / ${totalWords} (${chPct}%)</div>
        <div class="eg-progress-track"><div class="eg-progress-fill"></div></div>
        <div class="eg-tap-hint">Tap anywhere to continue</div>`;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // ── Animated score count-up ──
    const countEl = overlay.querySelector('.eg-count');
    const start   = performance.now();
    const dur     = 1400;
    function _countUp(now) {
        const t = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);           // ease-out cubic
        countEl.textContent = Math.round(ease * correct);
        if (t < 1) requestAnimationFrame(_countUp);
    }
    requestAnimationFrame(_countUp);

    // ── Animate chapter progress bar ──
    requestAnimationFrame(() => {
        const fill = overlay.querySelector('.eg-progress-fill');
        if (fill) fill.style.width = chPct + '%';
    });

    // ── Falling confetti rain ──
    const RAIN_COLORS = ['#FF6B6B','#FFA500','#FFD700','#00C896','#667EEA','#F093FB','#06B6D4','#FF9F43','#A78BFA','#34D399'];
    for (let i = 0; i < 80; i++) {
        const c       = document.createElement('div');
        c.className   = 'eg-confetti';
        const isRect  = Math.random() > 0.4;
        c.style.left  = `${Math.random() * 100}%`;
        c.style.width = `${isRect ? 6 + Math.random() * 5 : 7 + Math.random() * 6}px`;
        c.style.height= `${isRect ? 14 + Math.random() * 10 : 7 + Math.random() * 6}px`;
        if (!isRect) c.style.borderRadius = '50%';
        c.style.background = RAIN_COLORS[Math.floor(Math.random() * RAIN_COLORS.length)];
        c.style.setProperty('--rot',  `${Math.random() * 540 - 270}deg`);
        c.style.setProperty('--flip', Math.random() > 0.5 ? '1' : '-1');
        c.style.animationDelay    = `${Math.random() * 1.8}s`;
        c.style.animationDuration = `${2.4 + Math.random() * 2}s`;
        overlay.appendChild(c);
    }

    // ── Firework bursts ──
    const SPARK_COLORS = ['#FFD700','#FF6B6B','#06B6D4','#00C896','#F093FB','#FF9F43'];
    function _fireFirework(xPct, yPct, delay) {
        setTimeout(() => {
            const fw  = document.createElement('div');
            fw.className = 'eg-firework';
            fw.style.left = xPct + '%';
            fw.style.top  = yPct + '%';
            overlay.appendChild(fw);
            const count = 18;
            for (let i = 0; i < count; i++) {
                const sp = document.createElement('div');
                sp.className = 'eg-spark';
                const angle  = (360 / count) * i;
                const dist   = 50 + Math.random() * 70;
                const color  = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
                sp.style.setProperty('--a',    `${angle}deg`);
                sp.style.setProperty('--dist', `-${dist}px`);
                sp.style.setProperty('--spark-color', color);
                sp.style.animationDelay    = `${Math.random() * 0.1}s`;
                sp.style.animationDuration = `${0.65 + Math.random() * 0.3}s`;
                fw.appendChild(sp);
            }
            setTimeout(() => fw.remove(), 1200);
        }, delay);
    }

    _fireFirework(20 + Math.random() * 20, 15 + Math.random() * 20,  400);
    _fireFirework(60 + Math.random() * 20, 10 + Math.random() * 20, 1100);
    _fireFirework(35 + Math.random() * 30, 20 + Math.random() * 15, 1800);

    // ── Dismiss logic ──
    let dismissed = false;
    function _dismiss() {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(autoTimer);
        overlay.classList.add('eg-dismissing');
        setTimeout(() => { overlay.remove(); onDone(); }, 480);
    }

    overlay.addEventListener('click', _dismiss);
    const autoTimer = setTimeout(_dismiss, 5500);
}

/* ── Correct-answer celebration ──────────────────────────────────────────
   Bursts 45 confetti particles outward from the screen centre and pops a
   large emoji badge.  All elements are removed after 2.2 s automatically.
   ──────────────────────────────────────────────────────────────────────── */
function _showCorrectAnimation() {
    document.getElementById('correct-anim-container')?.remove();

    const wrap = document.createElement('div');
    wrap.id = 'correct-anim-container';
    document.body.appendChild(wrap);

    // Random emoji badge in the centre
    const badge = document.createElement('div');
    badge.className = 'ca-badge';
    badge.textContent = ['🎉', '🌟', '🎊', '⭐', '✨'][Math.floor(Math.random() * 5)];
    wrap.appendChild(badge);

    // Confetti burst — particles radiate outward at random angles
    const COLORS = ['#FF6B6B','#FFA500','#FFD700','#00C896','#667EEA','#F093FB','#06B6D4','#FF9F43'];
    for (let i = 0; i < 45; i++) {
        const p     = document.createElement('div');
        p.className = 'ca-particle';
        const angle = Math.random() * 360;
        const dist  = 100 + Math.random() * 220;
        p.style.setProperty('--dx',    `${Math.cos(angle * Math.PI / 180) * dist}px`);
        p.style.setProperty('--dy',    `${Math.sin(angle * Math.PI / 180) * dist - 40}px`);
        p.style.setProperty('--rot',   `${Math.random() * 720 - 360}deg`);
        p.style.setProperty('--color', COLORS[Math.floor(Math.random() * COLORS.length)]);
        p.style.width             = `${6  + Math.random() * 8}px`;
        p.style.height            = `${Math.random() > 0.4 ? 14 + Math.random() * 10 : 6 + Math.random() * 8}px`;
        p.style.animationDelay    = `${Math.random() * 0.12}s`;
        p.style.animationDuration = `${0.75 + Math.random() * 0.55}s`;
        wrap.appendChild(p);
    }

    setTimeout(() => wrap.remove(), 2200);
}

/* ── Sentence translation toast ─────────────────────────────────────────
   Slides in from the top of the screen for 5 s when the user taps the
   Dutch sentence sample, showing its English translation.  Clicking it
   dismisses it early.
   ──────────────────────────────────────────────────────────────────────── */
const _toast = (() => {
    const el = document.createElement('div');
    el.id = 'sentence-toast';
    el.innerHTML = `
        <div class="toast-handle"></div>
        <div class="toast-body">
            <div class="toast-section">
                <span class="toast-lang">🇳🇱 Dutch example</span>
                <p class="toast-dutch-text"></p>
            </div>
            <div class="toast-sep"></div>
            <div class="toast-section">
                <span class="toast-lang">🇬🇧 English</span>
                <p class="toast-text"></p>
            </div>
        </div>
        <div class="toast-progress-bar"></div>`;
    document.body.appendChild(el);
    return el;
})();

let _toastTimer = null;

function _showTranslationToast(dutchText, englishText) {
    if (!englishText?.trim()) return;
    clearTimeout(_toastTimer);
    _toast.querySelector('.toast-dutch-text').textContent = dutchText || '';
    _toast.querySelector('.toast-text').textContent = englishText;

    // Restart the countdown animation by forcing a reflow between class removals
    const bar = _toast.querySelector('.toast-progress-bar');
    bar.classList.remove('running');
    void bar.offsetWidth;           // reflow — resets animation state
    bar.classList.add('running');

    _toast.classList.add('visible');
    _toastTimer = setTimeout(_hideTranslationToast, 5000);
}

function _hideTranslationToast() {
    clearTimeout(_toastTimer);
    _toast.classList.remove('visible');
}

_toast.addEventListener('click', _hideTranslationToast);

/* Close button — lets mobile users dismiss the popup mid-game */
(function wireCloseButton() {
    const btn = document.getElementById('game-close-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (recentGames.length > 0) _saveSeenWords(recentGames);
        document.body.classList.remove('game-active');
        document.getElementById('popup').style.display = 'none';
        data             = [];
        correctAnswers   = 0;
        currentWordIndex = 0;
        window.speechSynthesis?.cancel();
    });
})();

function getRandomData(listData, count) {
    const valid = listData.filter(
        x => x && typeof x === 'object' && typeof x.english === 'string' && x.english.trim() !== ''
    );
    let candidates = valid.filter(x => !recentGames.includes(x.english));

    if (candidates.length < count) {
        recentGames = [];          // full cycle done — reset so all words are fair game again
        candidates  = valid.slice();
    }

    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, Math.min(count, candidates.length));
}
