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

// // Function to get 10 random items from data
// function getRandomData(listData, count) {
//     const randomData = [];
//     const selectedIndices = new Set();
//     // check if recentGames covered more than count
//     if (listData.length - recentGames.length < count) {
//         recentGames = []; // reset the recentGames
//     }

//     while (randomData.length < count) {
//         const randomIndex = Math.floor(Math.random() * listData.length);
//         if (!selectedIndices.has(randomIndex) && !recentGames.includes(listData[randomIndex])) {
//             randomData.push(listData[randomIndex]);
//             selectedIndices.add(randomIndex);
//         }
//     }
//     return randomData;
// }


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
