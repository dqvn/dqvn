let currentWordIndex = 0;
let correctCount = 0;
let data = [];

document.getElementById("start-button").addEventListener("click", startGame);

function startGame() {
  currentWordIndex = 0;
  correctCount = 0;
  console.log(wordList);
  document.getElementById("result").innerHTML = "";
  document.getElementById("popup").style.display = "block";
  showWord();
}

function showWord() {
  const word = wordlist[currentWordIndex];
  document.getElementById("word").innerHTML = word.dutch;
  const options = [word.english,...getRandomOptions(wordlist, word.english)];
  document.getElementById("options").innerHTML = "";
  for (let i = 0; i < options.length; i++) {
    const option = document.createElement("p");
    option.innerHTML = options[i];
    document.getElementById("options").appendChild(option);
  }
  document.getElementById("meaning").innerHTML = "";
}

function getRandomOptions(wordlist, correctOption) {
  const options = [];
  while (options.length < 4) {
    const randomIndex = Math.floor(Math.random() * wordlist.length);
    if (wordlist[randomIndex].english!== correctOption &&!options.includes(wordlist[randomIndex].english)) {
      options.push(wordlist[randomIndex].english);
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
  if (currentWordIndex >= wordlist.length) {
    document.getElementById("result").innerHTML = "Game over! You got " + correctCount + " out of " + wordlist.length + " correct";
    document.getElementById("popup").style.display = "none";
  } else {
    showWord();
  }
}