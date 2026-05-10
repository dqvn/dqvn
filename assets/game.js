'use strict';

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
        questionDiv.textContent = response.message.content;
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
    maxNumber = Math.min(15, wordList.length);

    if (!data || data.length === 0) {
        _ensureProgressLoaded();

        const prevSeenLen = recentGames.length;
        data = getRandomData(wordList, maxNumber);

        if (prevSeenLen > 0 && recentGames.length === 0) {
            _saveSeenWords([]);
        }

        _updateProgressHeader();
    }

    if (currentWordIndex < maxNumber && currentWordIndex < data.length) {
        const currentWord = data[currentWordIndex];

        const options = [currentWord.english];
        while (options.length < Math.min(9, data.length)) {
            const pick = data[Math.floor(Math.random() * data.length)].english;
            if (!options.includes(pick)) options.push(pick);
        }
        shuffle(options);

        document.getElementById('progress').textContent = `${currentWordIndex + 1} / ${maxNumber}`;
        document.getElementById('game-container').querySelector('h1').textContent = currentWord.dutch;
        generateStoryFromPuter(data, document.getElementById('question'));

        const sentenceDiv = document.getElementById('sentence');
        if (sentenceDiv) {
            sentenceDiv.textContent = currentWord.dutchsentence;
            sentenceDiv.onclick     = () => speakText(currentWord.dutchsentence);
        }

        document.getElementById('options').innerHTML  = '';
        document.getElementById('result').textContent = '';

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
    _ttsSeq++;                              // invalidate any pending showQuestion TTS chain
    window.speechSynthesis.cancel();        // stop whatever is currently speaking

    if (selectedOption === correctAnswer) {
        correctAnswers++;
        if (!recentGames.includes(correctAnswer)) recentGames.push(correctAnswer);
        document.getElementById('result').textContent = 'Correct!';
        await speakEngTextAsync('Correct: ' + correctAnswer);
    } else {
        document.getElementById('result').textContent = `Incorrect. The correct answer is ${correctAnswer}.`;
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
    document.getElementById('game-container').querySelector('h1').textContent = 'The game is finished!';
    document.getElementById('result').textContent =
        `Game over! You got ${correctAnswers} / ${maxNumber} correct.  (${seenNow} / ${total} chapter words seen)`;
    document.getElementById('question').textContent = '';
    document.getElementById('options').innerHTML    = '';

    setTimeout(() => {
        document.getElementById('popup').style.display = 'none';
        data             = [];
        correctAnswers   = 0;
        currentWordIndex = 0;
        document.getElementById('result').textContent = "Let's go!!!";
    }, 3000);
}

/* Close button — lets mobile users dismiss the popup mid-game */
(function wireCloseButton() {
    const btn = document.getElementById('game-close-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        // Save whatever words were answered correctly this partial round before quitting
        if (recentGames.length > 0) _saveSeenWords(recentGames);
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
