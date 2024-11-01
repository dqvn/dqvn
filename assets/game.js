let correctAnswers = 0;
let currentWordIndex = 0;
let data = [];

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function showQuestion() {
    document.getElementById('popup').style.display = 'flex';
    data = getRandomData(wordList, 10); // Get 10 random items from data
    if (currentWordIndex < 10 && currentWordIndex < data.length) {
        const currentWord = data[currentWordIndex];

        const options = [currentWord.english];
        while (options.length < 5) {
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

        titleDiv.textContent = `Dutch word: "${currentWord.dutch}"?`;
        questionDiv.textContent = `What is the English meaning of "${currentWord.dutch}"?`;
        optionsDiv.innerHTML = "";

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
        document.getElementById('result').textContent = "Correct!";
    } else {
        document.getElementById('result').textContent = `Incorrect. The correct answer is ${correctAnswer}.`;
    }

    currentWordIndex++;
    setTimeout(showQuestion, 1000);
}

function showResult() {
    document.getElementById('result').textContent = `Game over! You got ${correctAnswers} out of ${Math.min(10, data.length)} correct.`;
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
    console.log(randomData);
    return randomData;
}
