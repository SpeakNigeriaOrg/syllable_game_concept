// --- GLOBAL CONFIGURATION ---
const BASE_URL = "https://pub-5da9d55f185e47e790045ceb1be1facd.r2.dev/";

// These can eventually be tied to a UI dropdown menu
let CURRENT_SPEAKER = "speaker1"; 
let CURRENT_IMAGE_STYLE = "cartoon"; 
// ----------------------------

let gameData = [];
let currentLevelIndex = 0;
let currentWordIndex = 0;

let currentLevel = null;
let currentWord = null;
let queue = [];
let maxSlots = 0;
let isTransitioning = false; 
let currentPlayingAudio = null; 

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function startGame() {
    // 1. Hide the overlay
    document.getElementById('start-overlay').style.display = 'none';
    
    // 2. Now it is safe to load the first word
    loadWord(0); 
}

async function loadGame() {
    try {
        const [wordsResponse, syllablesResponse, sessionsResponse] = await Promise.all([
            fetch('words.json'),
            fetch('syllables.json'),
            fetch('sessions.json')
        ]);
        
        const dictionaryWords = await wordsResponse.json();
        const dictionarySyllables = await syllablesResponse.json();
        const sessions = await sessionsResponse.json();
        
        gameData = sessions.map(session => {
            let sessionWords = [];
            let sessionSyllablePool = [];

            // Automatically determine the correct speaker for this specific level
            let levelSpeaker = CURRENT_SPEAKER; 
            if (session.validSpeakers && session.validSpeakers.length > 0) {
                levelSpeaker = session.validSpeakers[0]; 
            }
            
            session.words.forEach(wordId => {
                const wordData = dictionaryWords[wordId];
                
                if (wordData) {
                    const dynamicAudioUrl = `${BASE_URL}words/${levelSpeaker}/${wordId}.wav`;
                    const dynamicImageUrl = `${BASE_URL}images/${CURRENT_IMAGE_STYLE}/${wordId}.png`;

                    // ADDITION: Pre-calculate the tones for this word to use in the hint
                    const targetTones = wordData.syllables.map(syllable => {
                        const info = dictionarySyllables[levelSpeaker]?.[syllable];
                        return info ? info.tone : "mid"; // fallback to mid if missing
                    });

                    sessionWords.push({
                        id: wordId,
                        targetWord: wordData.displayText, 
                        targetSyllables: wordData.syllables,
                        targetTones: targetTones, // Save the mapped tones array
                        fullAudioUrl: dynamicAudioUrl, 
                        imageUrl: dynamicImageUrl
                    });
                                        
                    wordData.syllables.forEach(syllable => {
                        if (!sessionSyllablePool.some(s => s.text === syllable)) {
                            const syllableInfo = dictionarySyllables[levelSpeaker]?.[syllable];
                            
                            if (syllableInfo && syllableInfo.audio) {
                                sessionSyllablePool.push({
                                    text: syllable,
                                    audio: syllableInfo.audio, 
                                    tone: syllableInfo.tone 
                                });
                            } else {
                                console.warn(`[Missing Asset] Syllable "${syllable}" missing for ${levelSpeaker}`);
                            }
                        }
                    });
                }
            });
            
            return {
                levelId: session.levelId,
                syllablePool: shuffleArray(sessionSyllablePool),
                words: shuffleArray(sessionWords)
            };
        });
        
        initializeThemeSelector(); 
        loadLevel(0);              
        
    } catch (error) {
        document.getElementById('feedback-message').innerText = "Error loading game data.";
        console.error("Failed to load game data:", error);
    }
}

function initializeThemeSelector() {
    const selector = document.getElementById('theme-selector');
    selector.innerHTML = ''; 
    
    gameData.forEach((theme, index) => {
        const option = document.createElement('option');
        option.value = index;            
        option.innerText = theme.levelId; 
        selector.appendChild(option);
    });

    selector.addEventListener('change', (event) => {
        loadLevel(parseInt(event.target.value)); 
    });
}

function loadLevel(levelIndex) {
    if (levelIndex >= gameData.length) {
        document.getElementById('feedback-message').innerText = "You've completed all the themes!";
        return;
    }
    
    currentLevelIndex = levelIndex;
    currentLevel = gameData[currentLevelIndex];
    document.getElementById('theme-selector').value = currentLevelIndex;

    renderBank(); 
    loadWord(0);
}

function loadWord(wordIndex) {
    currentWordIndex = wordIndex;
    currentWord = currentLevel.words[currentWordIndex];
    
    maxSlots = currentWord.targetSyllables.length;
    queue = []; 
    
    const imgElement = document.getElementById('prompt-image');
    imgElement.onerror = function() {
        this.onerror = null; 
        this.src = 'images/placeholder.png'; 
    };
    imgElement.src = currentWord.imageUrl;
    
    document.getElementById('feedback-message').innerText = ""; 
    renderQueue();
    isTransitioning = false; 

    // CHANGE: Removed playFullWordAudio() from here so it doesn't auto-play
}

// ADDITION: New function to show the tone hint
function showToneHint() {
    if (!currentWord || !currentWord.targetTones || isTransitioning) return;
    
    // Joins the array ["mid", "mid", "high"] into "mid mid high"
    const hintString = currentWord.targetTones.join(" ");
    document.getElementById('feedback-message').innerText = `Tone Hint: ${hintString}`;
}

function playFullWordAudio() {
    if (currentWord && currentWord.fullAudioUrl) {
        const promptAudio = new Audio(currentWord.fullAudioUrl);
        promptAudio.play().catch(error => console.log("Audio play blocked or missing."));
    }
}

function moveToNextWord() {
    const nextWordIndex = currentWordIndex + 1;
    if (nextWordIndex < currentLevel.words.length) {
        loadWord(nextWordIndex); 
    } else {
        document.getElementById('feedback-message').innerText = "Theme Complete! Loading next set...";
        setTimeout(() => loadLevel(currentLevelIndex + 1), 1500);
    }
}

function renderBank() {
    const rows = {
        high: document.querySelector('#high-tones .bank-row'),
        mid: document.querySelector('#mid-tones .bank-row'),
        low: document.querySelector('#low-tones .bank-row')
    };
    
    Object.values(rows).forEach(row => row.innerHTML = '');

    currentLevel.syllablePool.forEach(buttonData => {
        const btn = document.createElement('button');
        btn.innerText = buttonData.text;
        btn.onclick = () => handleSyllableClick(buttonData);
        
        const tone = buttonData.tone || 'mid'; 
        btn.className = `btn-${tone}`;
        rows[tone].appendChild(btn);
    });
}

function renderQueue() {
    const slotsDiv = document.getElementById('queue-slots');
    slotsDiv.innerHTML = '';
    
    for (let i = 0; i < maxSlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.innerText = queue[i] || ''; 
        slotsDiv.appendChild(slot);
    }
}

function handleSyllableClick(buttonData) {
    if (isTransitioning) return; 

    if (currentPlayingAudio) {
        currentPlayingAudio.pause();
        currentPlayingAudio.currentTime = 0; 
    }

    if (buttonData.audio) {
        const absoluteUrl = BASE_URL + buttonData.audio;
        currentPlayingAudio = new Audio(absoluteUrl);
        currentPlayingAudio.play().catch((err) => {
            console.error("Audio playback blocked or file missing at:", absoluteUrl, err);
        });
    }

    queue.push(buttonData.text);
    if (queue.length > maxSlots) queue.shift(); 

    renderQueue();
    checkWinCondition();
}

function checkWinCondition() {
    const isMatch = queue.length === maxSlots && 
                    queue.every((val, index) => val === currentWord.targetSyllables[index]);
    
    if (isMatch) {
        isTransitioning = true; 
        document.getElementById('feedback-message').innerText = "Correct! Great job!";
        playWinningSequence(); 
    }
}

function playWinningSequence() {
    setTimeout(() => {
        const fullWordAudio = new Audio(currentWord.fullAudioUrl);
        
        fullWordAudio.onended = () => setTimeout(moveToNextWord, 1000);
        fullWordAudio.play().catch(() => setTimeout(moveToNextWord, 1000));
    }, 400); 
}

loadGame();