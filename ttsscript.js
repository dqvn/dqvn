var jsonData = {};

// Find the "Google Nederlands" voice for nl-NL
const googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
  return voice.name === 'Google Nederlands' && voice.lang === 'nl-NL';
});

const speech = new SpeechSynthesisUtterance();
speech.lang = 'nl-NL';
speech.volume = 1;
speech.rate = 0.8;
speech.pitch = 1;
speech.voice = googleNederlandsVoice; // Set the voice

// create a table body element
const tableBody = document.getElementById('word-list-body');


loadJsonData('https://dqvn.github.io/dqvn/ch03.json', function(jsonData) {
  console.log(jsonData);
  
  // loop through the JSON data and create table rows
  jsonData.forEach((word, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
    <td><span class="dutch-word" data-index="${index}">${word.dutch}</span></td>
    <td>${word.english}</td>
    <td>${word.vietnamese}</td>
  `;
    tableBody.appendChild(row);
  });
  
  document.addEventListener('DOMContentLoaded', function() {
    const dutchWords = document.querySelectorAll('.dutch-word');
    dutchWords.forEach(word => {
      word.addEventListener('click', function() {
        const textToSpeak = this.textContent;
        speakText(textToSpeak);
      });
    });
  });
});

// add event listener to each Dutch word span
document.querySelectorAll('.dutch-word').forEach((span) => {
  span.addEventListener('click', (e) => {
    const index = e.target.dataset.index;
    const word = jsonData[index].dutch;
    speakWord(word);
  });
});

// function to speak the word using Web SpeechSynthesis API
function speakText(text) {
  speech.text = text;
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
