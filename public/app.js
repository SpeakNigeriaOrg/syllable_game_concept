// --- GLOBAL CONFIGURATION ---
// Audio/image bytes live in R2, not this deploy - publishToR2.mjs is the
// real (credential-driven, laptop-independent) automation of that upload
// step. Only vocab.json/syllables.json/sessions.json ship same-origin
// with this page (small, and their validSpeakers/validStyles are
// meaningful only if generated against the bucket's real, just-verified
// state - see that script's header).
const BASE_URL = "https://gamemedia.speaknigeria.org/";

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
            fetch('vocab.json'),
            fetch('syllables.json'),
            fetch('sessions.json')
        ]);
        
        const dictionaryWords = await wordsResponse.json();
        const dictionarySyllables = await syllablesResponse.json();
        const sessions = await sessionsResponse.json();
        
        // A level with no validSpeakers has no guaranteed-complete audio for
        // ANY speaker - previously this fell through to a hardcoded default
        // speaker and played anyway, with missing syllables silently dropped
        // from the tappable bank (console.warn only, no visible error). Skip
        // it outright instead: the exporter (exportGameContent.mjs) only
        // ever emits levels it has already verified are fully covered for
        // at least one speaker, so an empty validSpeakers here would mean
        // hand-edited/stale session data, not a normal case to paper over.
        const playableSessions = sessions.filter(session => session.validSpeakers && session.validSpeakers.length > 0);
        const skippedCount = sessions.length - playableSessions.length;
        if (skippedCount > 0) {
            console.warn(`[Unplayable Level] Skipped ${skippedCount} level(s) with no validSpeakers.`);
        }

        gameData = playableSessions.map(session => {
            let sessionWords = [];
            let sessionSyllablePool = [];

            // Prefer the player's chosen speaker (CURRENT_SPEAKER - settable
            // via a future voice-picker UI) if this level actually supports
            // it; otherwise fall back to whichever speaker it does support.
            // Never falls through to an unsupported/hardcoded speaker now -
            // playableSessions above already guarantees validSpeakers is
            // non-empty and every listed speaker is fully covered.
            let levelSpeaker = session.validSpeakers.includes(CURRENT_SPEAKER)
                ? CURRENT_SPEAKER
                : session.validSpeakers[0];

            session.words.forEach(wordId => {
                const wordData = dictionaryWords[wordId];
                
                // publishToR2.mjs/exportGameContent.mjs now hard-gate every
                // word in sessions.json on having a real image (same as
                // audio coverage) - a placeholder graphic standing in for
                // missing art is fabricated content, not an acceptable
                // degrade. This check is defense-in-depth only: it should
                // never actually trigger against correctly-generated
                // content, but if it ever does (stale/hand-edited
                // sessions.json), skip the word entirely rather than
                // silently showing a placeholder.
                const imageStyles = wordData?.imageStyles || [];
                if (wordData && imageStyles.length === 0) {
                    console.error(`[Missing Image] "${wordId}" has no labeled image - excluding from this level (sessions.json should already guarantee this never happens; check its generation).`);
                }

                if (wordData && imageStyles.length > 0) {
                    const dynamicAudioUrl = `${BASE_URL}words/${levelSpeaker}/${wordId}.wav`;
                    // Prefer the player's chosen style if covered; otherwise
                    // fall back to whichever style IS covered.
                    const chosenStyle = imageStyles.includes(CURRENT_IMAGE_STYLE)
                        ? CURRENT_IMAGE_STYLE
                        : imageStyles[0];
                    const dynamicImageUrl = `${BASE_URL}images/${chosenStyle}/${wordId}.png`;

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

// ADDITION: Allow the user to skip a difficult word
function skipWord() {
    if (isTransitioning) return; // Prevent spam-clicking
    
    isTransitioning = true;
    
    const feedbackEl = document.getElementById('feedback-message');
    feedbackEl.innerText = "Skipping word...";
    feedbackEl.style.color = "#c62828"; // Make the text red to indicate a skip
    
    // Wait a brief moment so they can read the message, then move on
    setTimeout(() => {
        feedbackEl.style.color = ""; // Reset text color back to default
        moveToNextWord();
    }, 800);
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
        let hasMovedOn = false; // Flag to prevent double-firing

        // This function handles the transition
        const triggerNext = () => {
            if (!hasMovedOn) {
                hasMovedOn = true;
                setTimeout(moveToNextWord, 1000);
            }
        };

        // Standard triggers
        fullWordAudio.onended = triggerNext;
        fullWordAudio.play().catch(triggerNext);

        // FAILSAFE: If the OS freezes the audio (e.g., WhatsApp call), 
        // force the game to move on after 3.5 seconds anyway.
        setTimeout(triggerNext, 3500); 
        
    }, 400); 
}

loadGame();