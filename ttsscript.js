var jsonData = {};
var googleNederlandsVoice;
const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';
const TTSLangENG = 'en-US';

// assume you have an array of filenames
const fileNames = ["ch01","ch03"];

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

// init data
loadJsonData('ch03', reloadTable);

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

  speech.text = text;
  if (googleNederlandsVoice) {
    speech.voice = googleNederlandsVoice; // Set the voice
    document.getElementById('tts-name').innerHTML = googleNederlandsVoice.name; // show name of TTS
  } else {
    document.getElementById('tts-name').innerHTML = 'Mobile TTS';
  }
  window.speechSynthesis.speak(speech);
}

// function to speak English the word using Web SpeechSynthesis API
function speakEngText(text) {
  speechENG.text = text;
  window.speechSynthesis.speak(speechENG);
}

// create file list
const fileList = document.getElementById("file-list");
fileNames.forEach((fileName) => {
  const listItem = document.createElement("li");
  listItem.textContent = fileName;
  listItem.addEventListener("click", () => {
    // load new content when file is selected
    console.log("loadContent: " + fileName + ".json");
    loadJsonData(fileName, reloadTable)
  });
  fileList.appendChild(listItem);
});

// read dutch words in json file
function loadJsonData(filename, callback) {
  var xhr = new XMLHttpRequest();
  var filePath = "data/" + filename + ".json";
  xhr.open('GET', filePath, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
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
    <td>${index+1}</td>
    <td><span class="dutch-word" data-index="${index}" onclick="speakText('${word.dutch}')">${word.dutch}</span></td>
    <td><span onclick="speakEngText('${word.english}')">${word.english}</span></td>
    <td>${word.vietnamese}</td>
  `;
    tableBody.appendChild(row);
  });
}