let currentWordIndex = 0;
let correctCount = 0;
let data = [];

document.getElementById("start-button").addEventListener("click", startGame());

function startGame() {
  currentWordIndex = 0;
  correctCount = 0;
  data = wordlist;
  console.log(wordList);
  document.getElementById("result").innerHTML = "";
  document.getElementById("popup").style.display = "block";
  showWord();
}

function showWord() {
  const word = data[currentWordIndex];
  document.getElementById("word").innerHTML = word.dutch;
  const options = [word.english,...getRandomOptions(data, word.english)];
  document.getElementById("options").innerHTML = "";
  for (let i = 0; i < options.length; i++) {
    const option = document.createElement("p");
    option.innerHTML = options[i];
    document.getElementById("options").appendChild(option);
  }
  document.getElementById("meaning").innerHTML = "";
}

function getRandomOptions(data, correctOption) {
  const options = [];
  while (options.length < 4) {
    const randomIndex = Math.floor(Math.random() * data.length);
    if (data[randomIndex].english!== correctOption &&!options.includes(data[randomIndex].english)) {
      options.push(data[randomIndex].english);
    }
  }
  return options;
}

document.getElementById("submit-button").addEventListener("click", submitAnswer);

function submitAnswer() {
  const selectedOption = document.querySelector("input[name='option']:checked");
  if (!selectedOption) {
    alert("Please select an option");
    return;
  }
  const correctOption = document.getElementById("meaning").innerHTML;
  if (selectedOption.value === correctOption) {
    correctCount++;
    alert("Correct!");
  } else {
    alert("Incorrect. The correct answer is " + correctOption);
  }
  currentWordIndex++;
  if (currentWordIndex >= data.length) {
    document.getElementById("result").innerHTML = "Game over! You got " + correctCount + " out of " + data.length + " correct";
    document.getElementById("popup").style.display = "none";
  } else {
    showWord();
  }
}