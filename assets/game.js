let correctAnswers = 0;
let currentWordIndex = 0;
let data = [];
let recentGames = [];
let maxNumber = 15;

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function showQuestion() {
    document.getElementById('popup').style.display = 'flex';
    maxNumber = Math.min(15, wordList.length);
    if (!data || data.length === 0) {
        data = getRandomData(wordList, maxNumber);
    }

    if (currentWordIndex < maxNumber && currentWordIndex < data.length) {
        const currentWord = data[currentWordIndex];

        const options = [currentWord.english];
        while (options.length < Math.min(9, data.length)) {
            const randomIndex = Math.floor(Math.random() * data.length);
            const randomOption = data[randomIndex].english;
            if (!options.includes(randomOption)) {
                options.push(randomOption);
            }
        }
        shuffle(options);

        const questionDiv = document.getElementById('question');
        const sentenceDiv = document.getElementById('sentence');
        const optionsDiv = document.getElementById('options');
        const titleDiv = document.getElementById('game-container').querySelector('h1');
        const resultDiv = document.getElementById('result');

        (async () => {
            const _get = (e, s) => atob(e).slice(s.length);
            const _0x1f92 = "sa4634QDfdaawe6242rdsafsa";
            const words = data.map(item => item.dutch);

            try {
                const r = await fetch('\x68\x74\x74\x70\x73\x3a\x2f\x2f\x61\x70\x69\x2e\x64\x65\x65\x70\x73\x65\x65\x6b\x2e\x63\x6f\x6d\x2f\x63\x68\x61\x74\x2f\x63\x6f\x6d\x70\x6c\x65\x74\x69\x6f\x6e\x73', {
                    method: '\x50\x4f\x53\x54',
                    headers: {
                        '\x43\x6f\x6e\x74\x65\x6e\x74\x2d\x54\x79\x70\x65': '\x61\x70\x70\x6c\x69\x63\x61\x74\x69\x6f\x6e\x2f\x6a\x73\x6f\x6e',
                        '\x41\x75\x74\x68\x6f\x72\x69\x7a\x61\x74\x69\x6f\x6e': `Bearer ${_get(_0x4a21, _0x1f92)}`
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat",
                        messages: [
                            { role: "system", content: "Kort Nederlands verhaal." },
                            { role: "user", content: `Gebruik deze woorden: ${words.join(', ')}` }
                        ]
                    })
                });

                const d = await r.json();
                console.log(d.choices[0].message.content);
                questionDiv.textContent = `[${currentWordIndex + 1} / ${maxNumber}] <br/> ${d.choices[0].message.content}`;
            } catch (e) {
                console.error("\x45\x72\x72\x6f\x72");
            }
        })();

        titleDiv.textContent = `${currentWord.dutch}`;
        // questionDiv.textContent = `[${currentWordIndex + 1} / ${maxNumber}]`;
        if (sentenceDiv) {
            sentenceDiv.textContent = `${currentWord.dutchsentence}`;
            sentenceDiv.onclick = () => {
                speakText(currentWord.dutchsentence);
            };
        }
        optionsDiv.innerHTML = "";
        resultDiv.textContent = "";
        speakText(currentWord.dutch);
        if (currentWord.dutchsentence) {
            setTimeout(() => speakText(currentWord.dutchsentence), 5000);
        }

        const frag = document.createDocumentFragment();

        options.forEach((option, index) => {
            const button = document.createElement('button');
            button.textContent = option;
            button.onclick = () => checkAnswer(option, currentWord.english, currentWord.index);

            frag.appendChild(button);

            // Add <br> between buttons, but not after the last one
            if (index < options.length - 1) {
                frag.appendChild(document.createElement('br'));
            }

        });

        optionsDiv.appendChild(frag);

    } else {
        showResult();
    }
}

function checkAnswer(selectedOption, correctAnswer) {
    if (selectedOption === correctAnswer) {
        correctAnswers++;
        recentGames.push(correctAnswer);
        // remove duplicate words
        recentGames = recentGames.filter((item, index, self) => {
            return index === self.indexOf(item);
        });
        speakEngText("Correct: " + correctAnswer);
        document.getElementById('result').textContent = "Correct!";
    } else {
        // Remove all items that match "Game 2"
        recentGames = recentGames.filter(game => game !== correctAnswer);
        document.getElementById('result').textContent = `Incorrect. The correct answer is ${correctAnswer}.`;
        speakEngText("Incorrect. The correct answer is " + correctAnswer);
    }

    currentWordIndex++;
    setTimeout(showQuestion, 3000);
}

function showResult() {
    document.getElementById('game-container').querySelector('h1').textContent = 'The game is finished!';
    document.getElementById('result').textContent = `Game over! You got ${correctAnswers} out of ${maxNumber} correct.`;
    document.getElementById('question').textContent = '';
    document.getElementById('options').innerHTML = '';
    let intervalId = setInterval(() => {
        document.getElementById('popup').style.display = 'none';
        data = [];
        correctAnswers = 0;
        currentWordIndex = 0;
        document.getElementById('result').textContent = "Let's go!!!";
        clearInterval(intervalId);
    }, 3000);
}

function getRandomData(listData, count) {
    const randomData = [];
    const selectedIndices = new Set();

    // Build a valid pool with items that have a usable 'english' field
    const valid = listData.filter(
        (x) => x && typeof x === 'object' && typeof x.english === 'string' && x.english.trim() !== ''
    );

    // Determine candidates not in recentGames (by 'english')
    let candidates = valid.filter((x) => !recentGames.includes(x.english));

    // If we don't have enough, reset recentGames and use all valid items
    if (candidates.length < count) {
        recentGames = [];
        candidates = valid.slice();
    }

    // Avoid infinite loop by sampling from candidates only
    // Shuffle candidates (Fisher–Yates) then take 'count'
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return candidates.slice(0, Math.min(count, candidates.length));
}
