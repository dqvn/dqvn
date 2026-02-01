let correctAnswers = 0;
let currentWordIndex = 0;
let data = [];
let recentGames = [];
let maxNumber = 15;

async function generateStoryFromPuter(dataObjects, questionDiv) {
    // 1. Convert objects to a simple list of Dutch words
    const words = dataObjects.map(item => item.dutch.split(',')[0].trim());
    
    // 2. Call Puter AI (No API key or fetch headers needed!)
    try {
        const response = await puter.ai.chat(
            `Schrijf een kort Nederlands verhaal van 5 zinnen met deze woorden: ${words.join(', ')}. 
                GEEF ALLEEN DE TEKST TERUG. GEEN MARKDOWN, GEEN TITEL, GEEN UITLEG EN GEEN QUOTES.`,
            { model: 'gpt-5.2' } // You can also use 'claude-3-5-sonnet' or 'deepseek-chat' or "gpt-4o-mini"
        );

        // 3. Puter returns the message object directly
        console.log("Verhaal:", response.message.content);
        // questionDiv.textContent = `[${currentWordIndex + 1} / ${maxNumber}] ${response.message.content}`;
        questionDiv.textContent = `${response.message.content}`;
    } catch (error) {
        console.error("Fout bij het genereren:", error);
    }
}

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

        const progressDiv = document.getElementById('progress');
        const questionDiv = document.getElementById('question');
        const sentenceDiv = document.getElementById('sentence');
        const optionsDiv = document.getElementById('options');
        const titleDiv = document.getElementById('game-container').querySelector('h1');
        const resultDiv = document.getElementById('result');

        progressDiv.textContent = `${currentWordIndex + 1} / ${maxNumber}`;

        generateStoryFromPuter(data, questionDiv);
        // questionDiv.textContent = `[${currentWordIndex + 1} / ${maxNumber}]`;
        
        titleDiv.textContent = `${currentWord.dutch}`;
        
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
