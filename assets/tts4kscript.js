const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';
const TTSLangENG = 'en-US';
const fileNames = ["4000", "pn_th"];
const INTERVAL_TIME = 12000;

// create a table body element
const tableBody = document.getElementById('word-list-body');
const hideMeaningCheckbox = document.getElementById('hide-meaning');
const volumeControl = document.getElementById('volume-control');
const year = document.getElementById('year');

const recentNumbers = [];
var wordList = [];
var jsonData = {};
var googleNederlandsVoice;

// Add volumn control
volumeControl.addEventListener('input', () => {
  const volumeValue = volumeControl.value;
  document.getElementById('volume-value').textContent = `${volumeValue}%`;
});

// play button
const playStopButton = document.getElementById('playStopButton');
var isPlaying = false;
var currentInterval = null;

playStopButton.addEventListener('click', () => {
  if (!isPlaying) {
    startSpelling();
  } else {
    stopSpelling();
  }
});

// create list of lesson
createLeftMenu();

// init data
loadJsonData('4000', reloadTable);

// set footer year
year.textContent = new Date().getFullYear();

// Enable NoSleep
document.addEventListener('DOMContentLoaded', function () {
  var noSleep = new NoSleep();
  noSleep.enable();
});

// ========================
// =       Functions      =
// ========================
function createLeftMenu() {
  // create file list
  var fileList = document.getElementById("file-list");
  fileNames.sort();
  fileNames.forEach((fileName) => {
    const listItem = document.createElement("li");
    listItem.textContent = fileName;
    listItem.addEventListener("click", () => {
      // load new content when file is selected
      console.log("loadContent: " + fileName + ".json");
      loadJsonData(fileName, reloadTable);
      // update on going chapter
      document.getElementById('chapter').innerHTML = "(You are learning in " + fileName + ")";
    });
    fileList.appendChild(listItem);
  });
}

// function to speak the word using Web SpeechSynthesis API
function speakText(text) {
  const availableVoices = window.speechSynthesis.getVoices();
  if (availableVoices.length <= 0) {
    document.getElementById('tts-name').innerHTML = 'No voices available!';
    console.error("No voices available!");
    return;
  }

  // Find the "Google Nederlands" voice for nl-NL
  if (!googleNederlandsVoice) {
    googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
      return voice.name === TTSName && voice.lang === TTSLang;
    });
  }

  if (!googleNederlandsVoice) {
    googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
      return voice.lang === TTSLang;
    });
  }

  // console.log(googleNederlandsVoice);

  try {
    const speech = new SpeechSynthesisUtterance();
    if (googleNederlandsVoice) {
      speech.voice = googleNederlandsVoice; // Set the voice
      document.getElementById('tts-name').innerHTML = googleNederlandsVoice.name; // show name of TTS
    }

    speech.lang = TTSLang;
    speech.volume = 1;
    speech.rate = 0.8;
    speech.pitch = 1;
    speech.text = text;
    speech.volume = volumeControl.value / 100;
    speech.onerror = (event) => {
      console.error("Speech synthesis error:", event.error);
    };
    // Check if speech synthesis is already speaking
    if (window.speechSynthesis.speaking) {
      console.log("Interrupting current speech.");
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
    }
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(speech);
    // Optional: Add an event listener to detect errors

  } catch (error) {
    if (error.name === 'NotAllowedError') {
      console.error('Speech synthesis is not allowed:', error);
    } else if (error.name === 'NotSupportedError') {
      console.error('Speech synthesis is not supported:', error);
    } else {
      console.error('Error speaking text:', error);
    }
  }
}

// function to speak English the word using Web SpeechSynthesis API
function speakEngText(text) {
  const speechENG = new SpeechSynthesisUtterance();
  speechENG.text = text;
  speechENG.rate = 0.8;
  speechENG.volume = volumeControl.value / 100;
  speechENG.voice = window.speechSynthesis.getVoices()[0];
  // Check if speech synthesis is already speaking
  if (window.speechSynthesis.speaking) {
    console.log("Interrupting current speech.");
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
  }
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(speechENG);
}

// read dutch words in json file
function loadJsonData(filename, callback) {
  var xhr = new XMLHttpRequest();
  var filePath = "data/" + filename + ".json";
  xhr.open('GET', filePath, true);
  xhr.onload = function () {
    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
      wordList = data;
      callback(data);
    } else {
      console.log('Error loading JSON');
    }
  };
  xhr.send();
}

// generate the table with jsonData
function reloadTable(jsonData) {
  // clear old data
  recentNumbers.length = 0;
  tableBody.innerHTML = "";

  // loop through the JSON data and create table rows
  jsonData.forEach((word, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
    <td>${index + 1}</td>
    <td onclick="speakEngText('${word.eng}')"><span class="dutch-word" data-index="${index}">${word.eng} </span> ${word.pro}</td>
    <td onclick="speakEngText('${word.vie}')"><span class="hide-text">${word.vi}</span></td>
    <td><span class="hide-text">${word.vie} <br/>(${word.vim})</span></td>
  `;
    tableBody.appendChild(row);
  });
  // add empty row
  for (let i = 0; i < 100; i++) {
    const row = document.createElement('tr');
    row.innerHTML = `
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  `;
    tableBody.appendChild(row);
  }

  // reset the hide-meaning box
  document.getElementById('hide-meaning').checked = false;

  // Get the checkbox and the elements with the hide-text class
  var hideTextElements = document.querySelectorAll('.hide-text');

  // Add an event listener to the checkbox
  hideMeaningCheckbox.addEventListener('change', () => {
    // If the checkbox is checked, hide the text
    if (hideMeaningCheckbox.checked) {
      hideTextElements.forEach((element) => {
        element.style.display = 'none';
      });
    } else {
      // If the checkbox is not checked, show the text
      hideTextElements.forEach((element) => {
        element.style.display = 'initial';
      });
    }
  });
}

function startSpelling() {
  isPlaying = true;
  playStopButton.innerHTML = '<div class="icon"></div><span>Stop</span>';
  spellNextWord();
}

function stopSpelling() {
  isPlaying = false;
  playStopButton.innerHTML = '<div class="icon"></div><span>Play</span>';
  clearInterval(currentInterval);
}

function spellNextWord() {
  // const randomIndex = Math.floor(Math.random() * wordList.length);
  const randomIndex = getNewRandomNumberCSPRNG(0, wordList.length - 1, recentNumbers);
  const wordEN = wordList[randomIndex].eng;
  const rowToScroll = tableBody.children[randomIndex];

  // improving the balance rate of random numbers
  recentNumbers.push(randomIndex);
  if (recentNumbers.length > (wordList.length*0.9)) {
    recentNumbers.shift();
  }

  // Scroll the row to the top of the screen
  rowToScroll.scrollIntoView({ block: 'start' });

  speakEngText(wordEN);

  if (isPlaying) {
    currentInterval = setTimeout(spellNextWord, INTERVAL_TIME); // 5000ms = 5 seconds
  }
  // currentInterval = setTimeout(spellNextWord, INTERVAL_TIME); // 5000ms = 5 seconds
}

function getRandomNumberCSPRNG(min, max) {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  const randomNumber = (array[0] % (max - min + 1)) + min;
  return randomNumber;
}

function getNewRandomNumberCSPRNG(min, max, recentNumbers) {
  const array = new Uint32Array(1);
  let randomNumber;
  do {
    window.crypto.getRandomValues(array);
    randomNumber = (array[0] % (max - min + 1)) + min;
  } while (recentNumbers.includes(randomNumber));
  return randomNumber;
}