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
        const optionsDiv = document.getElementById('options');
        const titleDiv = document.getElementById('game-container').querySelector('h1');
        const resultDiv = document.getElementById('result');

        titleDiv.textContent = `Dutch word: "${currentWord.dutch}"?`;
        questionDiv.textContent = `[${currentWordIndex + 1}/${maxNumber}] - What is the English meaning of "${currentWord.dutch}"?`;
        optionsDiv.innerHTML = "";
        resultDiv.textContent = "";
        speakText(currentWord.dutch);

        options.forEach((option, index) => {
            const button = document.createElement('button');
            button.textContent = option;
            button.onclick = () => checkAnswer(option, currentWord.english, currentWord.index);
            optionsDiv.appendChild(button); //
        });

    } else {
        showResult();
    }
}

function checkAnswer(selectedOption, correctAnswer) {
    document.querySelectorAll('#options button').forEach(button => button.disabled = true);
    if (selectedOption === correctAnswer) {
        correctAnswers++;
        recentGames.push(correctAnswer);
        speakEngText("Correct: " + correctAnswer);
        document.getElementById('result').textContent = "Correct!";
    } else {
        // Remove all items that match "Game 2"
        recentGames = recentGames.filter(game => game!== correctAnswer);
        document.getElementById('result').textContent = `Incorrect. The correct answer is ${correctAnswer}.`;
        speakEngText("Incorrect. The correct answer is " + correctAnswer);
    }

    currentWordIndex++;
    setTimeout(showQuestion, 3000);
    document.querySelectorAll('#options button').forEach(button => button.disabled = false);
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

// Function to get 10 random items from data
function getRandomData(listData, count) {
    const randomData = [];
    const selectedIndices = new Set();
    // check if recentGames covered more than count
    if (listData.length - recentGames.length < count) {
        recentGames = []; // reset the recentGames
    }

    while (randomData.length < count) {
        const randomIndex = Math.floor(Math.random() * listData.length);
        if (!selectedIndices.has(randomIndex) && !recentGames.includes(listData[randomIndex])) {
            randomData.push(listData[randomIndex]);
            selectedIndices.add(randomIndex);
        }
    }
    return randomData;
}