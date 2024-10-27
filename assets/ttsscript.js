const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';
const TTSLangENG = 'en-US';
const fileNames = ["ch01", "ch03", "ch02", "ch04", "ch05", "ch06", "ch07", "ch08", "ch09", "ch10"];
const INTERVAL_TIME = 8000;
let wordList = [];

var jsonData = {};
var googleNederlandsVoice;

const speech = new SpeechSynthesisUtterance();
speech.lang = TTSLang;
speech.volume = 1;
speech.rate = 0.8;
speech.pitch = 1;

const speechENG = new SpeechSynthesisUtterance();
speechENG.lang = TTSLangENG;
speechENG.volume = 1;
speechENG.rate = 0.9;
speechENG.pitch = 1;

// create a table body element
const tableBody = document.getElementById('word-list-body');
const hideMeaningCheckbox = document.getElementById('hide-meaning');

const volumeControl = document.getElementById('volume-control');

// set footer year
const year = document.getElementById('year');
year.textContent = new Date().getFullYear();

// Add volumn control
volumeControl.addEventListener('input', () => {
  const volumeValue = volumeControl.value;
  document.getElementById('volume-value').textContent = `${volumeValue}%`;
});

// play button
const playStopButton = document.getElementById('playStopButton');
let isPlaying = false;
let currentInterval = null;

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
loadJsonData('ch04', reloadTable);

// Enable NoSleep
document.addEventListener('DOMContentLoaded', function() {
  var noSleep = new NoSleep();
  noSleep.enable();
});

// Functions
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

  
  if (googleNederlandsVoice) {
    speech.voice = googleNederlandsVoice; // Set the voice
    document.getElementById('tts-name').innerHTML = googleNederlandsVoice.name; // show name of TTS
  } else {
    speech.voice = window.speechSynthesis.getVoices()[0];
    document.getElementById('tts-name').innerHTML = 'Mobile TTS';
  }

  try {
    speech.text = text;
    speech.volume = parseFloat(volumeControl.value / 100).toPrecision(2); // volumeControl.value / 100;
    window.speechSynthesis.speak(speech);
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
  speechENG.text = text;
  speechENG.volume = volumeControl.value / 100;
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
  tableBody.innerHTML = "";

  // loop through the JSON data and create table rows
  jsonData.forEach((word, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
    <td>${index + 1}</td>
    <td onclick="speakText('${word.dutch}')"><span class="dutch-word" data-index="${index}">${word.dutch}</span></td>
    <td onclick="speakEngText('${word.english}')"><span class="hide-text">${word.english}</span></td>
    <td><span class="hide-text">${word.vietnamese}</span></td>
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
  const randomIndex = Math.floor(Math.random() * wordList.length);
  const wordNL = wordList[randomIndex].dutch;
  const wordEN = wordList[randomIndex].english;
  const rowToScroll = tableBody.children[randomIndex];

  // Scroll the row to the top of the screen
  rowToScroll.scrollIntoView({ block:'start' });

  speakText(wordNL);

  //setTimeout(speakEngText(wordEN), INTERVAL_TIME);
  currentInterval = setTimeout(spellNextWord, INTERVAL_TIME); // 5000ms = 5 seconds
}
