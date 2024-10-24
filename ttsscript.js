var jsonData = {};
var googleNederlandsVoice;
const TTSName = 'Google Nederlands';
const TTSLang = 'nl-NL';

const speech = new SpeechSynthesisUtterance();
speech.lang = TTSLang;
speech.volume = 1;
speech.rate = 0.8;
speech.pitch = 1;


// create a table body element
const tableBody = document.getElementById('word-list-body');


loadJsonData('https://dqvn.github.io/dqvn/ch03.json', function(jsonData) {
  console.log(jsonData);
  
  // loop through the JSON data and create table rows
  jsonData.forEach((word, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
    <td>${index+1}</td>
    <td><span class="dutch-word" data-index="${index}" onclick="speakText('${word.dutch}')">${word.dutch}</span></td>
    <td>${word.english}</td>
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
    document.getElementById('tts-name').innerHTML = JSON.stringify(window.speechSynthesis.getVoices(), null, 2);
  }
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
