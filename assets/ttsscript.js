const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';
const TTSLangENG = 'en-US';
const fileNames = ["ch00", "ch01", "ch03", "ch02", "ch04", "ch05", "ch06", "ch07", "ch08", "ch09", "ch10", "sp02", "sp03",
  "sp04", "sp05", "sp06", "sp07", "sp08", "sp09", "sp10", "sp11", "sp12", "sp13", "sp14", "sp15", "sp16", "sp17", "sp18",
  "sp19", "sp20", "sp21", "sp22", "sp23", "sp24", "sp25", "sp26", "sp27", "sw02", "sw05", "sw07", "sw09", "sw10", "sw12", "sw13",
  "sw14", "sw15", "sw16", "sw17", "sw18", "sw19", "sw20", "sw21", "sw22", "sw23", "sw24", "sw25", "sw26", "sw27", "sw28", "sw29", "sw30",
  "sw31", "sw32", "sw33", "sw34", "sw35", "sw36", "sw37", "sw38", "sw39", "sw40", 
  "sw41", "sw42", "sw43", "sw44", "sw45", "sw46", "sw47", "sw48", "sw49", "sw50", 
  "sw51", "sw52", "sz02", "sz03", "sz04", "sz05", "sz06", "sz07", "sz08", "sz09", "sz10", "sz11", "sz12", "sz13", "sz14", "sz15", "sz16", "sz17", "sz18", "sz19"];
let currentPage = localStorage.getItem('curPage') || fileNames[0];
const INTERVAL_TIME = 8000;

const GROUP_TITLES = new Map([
  ["ch", "Dutch Class #1"],
  ["sp", "Learn Dutch #2"],
  ["sw", "Learn Dutch #3"],
  ["sz", "Learn Dutch #4"],
]);

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
loadJsonData(currentPage, reloadTable);

// set footer year
year.textContent = new Date().getFullYear();

// Enable NoSleep
document.addEventListener('DOMContentLoaded', function () {
  var noSleep = new NoSleep();
  noSleep.enable();
});

// Show Game Play button
document.getElementById('start-button').addEventListener('click', () => {
  showQuestion();
});

// ========================
// =       Functions      =
// ========================
function createLeftMenu() {
  // create file list
  var fileList = document.getElementById("file-list");
  fileNames.sort();

  const filelistContainer = document.getElementById('file-list');
  const groupedFiles = {};
  fileNames.forEach(file => {
    const groupKey = file.substring(0, 2);
    if (!groupedFiles[groupKey]) {
      groupedFiles[groupKey] = [];
    }
    groupedFiles[groupKey].push(file);
  });

  for (const groupKey in groupedFiles) {
    filelistContainer.appendChild(createGroup(groupKey, groupedFiles[groupKey]));
  }
}

// function to speak the word using Web SpeechSynthesis API
function speakText(text) {
  // Check if speech synthesis is already speaking
  if (window.speechSynthesis.speaking) {
    console.log("Interrupting current speech.");
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
  }
  window.speechSynthesis.resume();

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
  speechENG.rate = 0.9;
  speechENG.volume = volumeControl.value / 100;
  speechENG.voice = window.speechSynthesis.getVoices()[0];
  window.speechSynthesis.speak(speechENG);
}

// read dutch words in json file
function loadJsonData(filename, callback) {
  localStorage.setItem('curPage', filename);
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
  // const randomIndex = Math.floor(Math.random() * wordList.length);
  const randomIndex = getNewRandomNumberCSPRNG(0, wordList.length - 1, recentNumbers);
  const wordNL = wordList[randomIndex].dutch;
  const wordEN = wordList[randomIndex].english;
  const rowToScroll = tableBody.children[randomIndex];

  // improving the balance rate of random numbers
  recentNumbers.push(randomIndex);
  if (recentNumbers.length > (wordList.length * 0.9)) {
    recentNumbers.shift();
  }

  // Scroll the row to the top of the screen
  rowToScroll.scrollIntoView({ block: 'start' });

  speakText(wordNL);

  //setTimeout(speakEngText(wordEN), INTERVAL_TIME);
  if (isPlaying) {
    currentInterval = setTimeout(spellNextWord, INTERVAL_TIME); // 5000ms = 5 seconds
  }
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

function createGroup(groupKey, files) {
  const groupElement = document.createElement('li');
  const groupTitle = document.createElement('div');
  groupTitle.classList.add('group-title');

  // mapping the defined groupKey if existed
  groupTitle.textContent = GROUP_TITLES.get(groupKey) || groupKey;

  groupTitle.addEventListener('click', () => {
    // Close all other open nested lists
    const allNestedLists = document.querySelectorAll('.nested-list');
    allNestedLists.forEach(list => list.classList.remove('open'));

    // Open the clicked nested list
    const nestedList = groupElement.querySelector('.nested-list');
    nestedList.classList.toggle('open');
  });

  const nestedList = document.createElement('ul');
  nestedList.classList.add('nested-list');
  files.forEach(file => {
    const fileItem = document.createElement('li');
    fileItem.textContent = file;
    fileItem.addEventListener("click", () => {
      loadJsonData(file, reloadTable);
      // update on going chapter
      document.getElementById('chapter').innerHTML = "(You are learning in " + file + ")";
    });
    nestedList.appendChild(fileItem);
  });
  groupElement.appendChild(groupTitle);
  groupElement.appendChild(nestedList);
  return groupElement;
}