// Call the function to load the JSON data
var jsonData = {};

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
function speakWord(word) {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'nl-NL'; // set language to Dutch
  speechSynthesis.speak(utterance);
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
