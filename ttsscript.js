var jsonData = {};

const speech = new SpeechSynthesisUtterance();
speech.lang = 'nl-NL';
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
  var googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
    return voice.name === 'Google Nederlands' && voice.lang === 'nl-NL';
    //return (voice.name === 'Google Nederlands' && voice.lang === 'nl-NL') || voice.lang === 'nl-NL';
  });

  if (!googleNederlandsVoice) {
    googleNederlandsVoice = window.speechSynthesis.getVoices().find(voice => {
      return voice.lang === 'nl-NL';
    });
  }

  // console.log(googleNederlandsVoice);
  // if (googleNederlandsVoice!== null) {
  //   alert(JSON.stringify(googleNederlandsVoice, null, 2));
  // }

  speech.text = text;
  speech.voice = googleNederlandsVoice // Set the voice
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
