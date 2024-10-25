var jsonData = {};
var googleNederlandsVoice;
const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';

// assume you have an array of filenames
const fileNames = ["ch03.json", "file2.json"];

const speech = new SpeechSynthesisUtterance();
speech.lang = TTSLang;
speech.volume = 1;
speech.rate = 0.8;
speech.pitch = 1;


// create a table body element
const tableBody = document.getElementById('word-list-body');


loadJsonData('ch03.json', function(jsonData) {
  console.log(jsonData);
  
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
});

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
    document.getElementById('tts-name').innerHTML = 'Mobile TTS'; //JSON.stringify(window.speechSynthesis.getVoices());
  }
  window.speechSynthesis.speak(speech);
}

function speakEngText(text) {
  speech.text = text;
  speech.lang = 'en-EN';
  window.speechSynthesis.speak(speech);
}

function loadJsonData(filename, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', filename, true);
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

// create file list
const fileList = document.getElementById("file-list");
fileNames.forEach((fileName) => {
  const listItem = document.createElement("li");
  listItem.textContent = fileName;
  listItem.addEventListener("click", () => {
    // load new content when file is selected
    // loadContent(fileName);
    console.log("loadContent...");
  });
  fileList.appendChild(listItem);
});

// load initial content
loadContent(fileNames[0]);

// function to load new content
function loadContent(fileName) {
  // assume you have a function to load data from file
  const data = loadDataFromFile(fileName);
  const wordListBody = document.getElementById("word-list-body");
  wordListBody.innerHTML = "";
  data.forEach((word) => {
    const row = document.createElement("tr");
    const cells = [
      document.createElement("td"),
      document.createElement("td"),
      document.createElement("td"),
      document.createElement("td"),
    ];
    cells[0].textContent = word.no;
    cells[1].textContent = word.dutch;
    cells[2].textContent = word.english;
    cells[3].textContent = word.vietnamese;
    row.appendChild(cells[0]);
    row.appendChild(cells[1]);
    row.appendChild(cells[2]);
    row.appendChild(cells[3]);
    wordListBody.appendChild(row);
  });
}
