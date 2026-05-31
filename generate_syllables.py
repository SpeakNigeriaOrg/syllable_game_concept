import json
import unicodedata

# --- CONFIGURATION ---
SPEAKERS = ["speaker1", "speaker2"]
# ---------------------

def generate_syllable_info(syllable, speaker):
    # Normalize to ensure compound diacritics are consistently grouped
    syllable = unicodedata.normalize('NFC', syllable.lower())
    
    # 1. Detect the tone
    tone = "mid" # Default
    if any(c in syllable for c in ['á', 'é', 'ẹ́', 'í', 'ó', 'ọ́', 'ú', 'ń']):
        tone = "high"
        suffix = "_high"
    elif any(c in syllable for c in ['à', 'è', 'ẹ̀', 'ì', 'ò', 'ọ̀', 'ù', 'ǹ']):
        tone = "low"
        suffix = "_low"
    else:
        suffix = ""

    # 2. Map characters cleanly (using sh, eh, oh for underdots)
    base_map = {
        # Regular tones
        'á': 'a', 'à': 'a',
        'é': 'e', 'è': 'e',
        'í': 'i', 'ì': 'i',
        'ó': 'o', 'ò': 'o',
        'ú': 'u', 'ù': 'u',
        'ń': 'n', 'ǹ': 'n', # <-- Fixed: Added missing 'n' tones
        
        # Underdot combinations mapped to clean digraphs
        'ẹ́': 'eh', 'ẹ̀': 'eh', 'ẹ': 'eh',
        'ọ́': 'oh', 'ọ̀': 'oh', 'ọ': 'oh',
        'ṣ': 'sh'
    }
    
    # 3. Safely replace characters
    safe_name = syllable
    # Sort keys by length (descending) to catch compound characters first
    for key in sorted(base_map.keys(), key=len, reverse=True):
        safe_name = safe_name.replace(key, base_map[key])
    
    # Strip any remaining invisible combining characters just to be bulletproof
    safe_name = "".join(c for c in safe_name if not unicodedata.combining(c))
    
    # Return both the path AND the tone label
    return {
        "audio": f"syllables/{speaker}/{safe_name}{suffix}.wav",
        "tone": tone
    }

def main():
    try:
        with open('words.json', 'r', encoding='utf-8') as f:
            words_data = json.load(f)
    except FileNotFoundError:
        print("Error: words.json not found in the current directory.")
        return

    unique_syllable_texts = set()
    for word_info in words_data.values():
        for syllable in word_info.get('syllables', []):
            unique_syllable_texts.add(syllable.lower())

    master_syllables = {}
    
    for speaker in SPEAKERS:
        master_syllables[speaker] = {}
        for syllable in unique_syllable_texts:
            master_syllables[speaker][syllable] = generate_syllable_info(syllable, speaker)

    with open('syllables.json', 'w', encoding='utf-8') as f:
        json.dump(master_syllables, f, indent=2, ensure_ascii=False)

    print(f"Success! Processed {len(unique_syllable_texts)} unique syllables for {len(SPEAKERS)} speakers.")

if __name__ == "__main__":
    main()