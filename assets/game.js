let correctAnswers = 0;
let currentWordIndex = 0;
let data = [];
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
    data = getRandomData(wordList, maxNumber);

    if (currentWordIndex < maxNumber && currentWordIndex < data.length) {
        const currentWord = data[currentWordIndex];

        const options = [currentWord.english];
        while (options.length < maxNumber) {
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
            button.onclick = () => checkAnswer(option, currentWord.english);
            optionsDiv.appendChild(button);
        });

    } else {
        showResult();
    }
}

function checkAnswer(selectedOption, correctAnswer) {
    if (selectedOption === correctAnswer) {
        correctAnswers++;
        speakEngText("Correct: " + correctAnswer);
        document.getElementById('result').textContent = "Correct!";
    } else {
        document.getElementById('result').textContent = `Incorrect. The correct answer is ${correctAnswer}.`;
        speakEngText("Incorrect. The correct answer is " + correctAnswer);
    }

    currentWordIndex++;
    setTimeout(showQuestion, 3000);
}

function showResult() {
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
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * listData.length);
        randomData.push(listData[randomIndex]);
    }
    return randomData;
}
