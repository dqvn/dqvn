const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';
const TTSLangENG = 'en-US';
const fileNames = ["thema01", "thema02", "thema03", "thema04", "thema05", "thema06", "thema07", "thema08"];
let currentPage = localStorage.getItem('currentPage') || fileNames[0];
const INTERVAL_TIME = 15000;

const GROUP_TITLES = new Map([
  ["th", "Van Start #1"]
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
document.getElementById('chapter').innerHTML = "(" + currentPage + ")";

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

document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggle-menu-button');
    const container = document.querySelector('.container'); // Get the main container

    // Optional: Get the icon to change it (e.g., from a hamburger to an X or an arrow)
    const buttonIcon = toggleButton.querySelector('.icon');

    if (toggleButton && container) {
        toggleButton.addEventListener('click', () => {
            // Toggle the 'menu-hidden' class on the container
            container.classList.toggle('menu-hidden');

            // 🌟 Optional: Change the button icon/text 🌟
            if (container.classList.contains('menu-hidden')) {
                // Menu is hidden, show an icon to reveal it (e.g., right arrow)
                buttonIcon.innerHTML = '▶'; // Right arrow (▶)
                // You might also want to move the button if it's placed inside the left-menu
                toggleButton.setAttribute('aria-expanded', 'false');
            } else {
                // Menu is visible, show an icon to hide it (e.g., hamburger or left arrow)
                buttonIcon.innerHTML = '☰'; // Hamburger (☰)
                toggleButton.setAttribute('aria-expanded', 'true');
            }
        });
        
        // Initial state: set the aria attribute
        toggleButton.setAttribute('aria-expanded', 'true'); 
    }
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

function getVoiceByNameAndLang(targetName, targetLang) {
  const voices = window.speechSynthesis.getVoices();
  return voices.find(voice => voice.name.includes(targetName) && voice.lang === targetLang);
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

  // // Find the "Google Nederlands" voice for nl-NL
  // if (!googleNederlandsVoice) {
  //   googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
  //     return voice.name === TTSName && voice.lang === TTSLang;
  //   });
  // }

  // if (!googleNederlandsVoice) {
  //   googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
  //     return voice.lang === TTSLang;
  //   });
  // }
  
  window.speechSynthesis.onvoiceschanged = () => {
    googleNederlandsVoice = getVoiceByNameAndLang("Microsoft Colette Online", "nl-NL");
    console.log("Loaded voice:", voice);
  };


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
  localStorage.setItem('currentPage', filename);
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
    <td onclick="speakText('${word.dutchsentence}')"><span>${word.dutchsentence}</span><br/><span class="hide-text" style="color: #3f3838ff; opacity: 0.3;">${word.englishtranslate}</span></td>
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
  const sample = wordList[randomIndex].dutchsentence;
  const rowToScroll = tableBody.children[randomIndex === 0 ? 0 : randomIndex - 1];
  const rowToScrollMain = tableBody.children[randomIndex];

  // improving the balance rate of random numbers
  recentNumbers.push(randomIndex);
  if (recentNumbers.length > (wordList.length * 0.9)) {
    recentNumbers.shift();
  }

  // Remove highlight from any previously highlighted row
  Array.from(tableBody.children).forEach(row => {
    row.classList.remove('highlighted-row');
  });
  
  // Scroll the row to the top of the screen
  rowToScroll.scrollIntoView({ block: 'start' });
  
  // Add highlight to the selected row
  rowToScrollMain.classList.add('highlighted-row');

  speakText(wordNL);
  // pause 2 seconds
  setTimeout(() => {
    speakText(sample);
  }, 3500);

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
      document.getElementById('chapter').innerHTML = "(" + file + ")";
    });
    nestedList.appendChild(fileItem);
  });
  groupElement.appendChild(groupTitle);
  groupElement.appendChild(nestedList);
  return groupElement;
}
window.speechSynthesis.onvoiceschanged = () => {
    googleNederlandsVoice = getVoiceByNameAndLang("Microsoft Colette Online", "nl-NL");
    console.log("Loaded voice:", voice);
};
