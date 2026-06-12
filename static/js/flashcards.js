document.addEventListener('DOMContentLoaded', () => {
    const cardSection = document.getElementById('flashcard-section');
    const cardWrapper = document.getElementById('flashcard-wrapper');
    const cardWord = document.getElementById('card-word');
    const cardDefinition = document.getElementById('card-definition');
    const cardExample = document.getElementById('card-example');
    
    const flipBtn = document.getElementById('flip-btn');
    const fcControls = document.getElementById('fc-controls');
    const ratingButtons = document.getElementById('fc-rating-buttons');
    const answerWrongBtn = document.getElementById('answer-wrong-btn');
    const answerCorrectBtn = document.getElementById('answer-correct-btn');
    
    const dueCountDisplay = document.getElementById('due-count');
    const totalCountDisplay = document.getElementById('total-count');
    const editCardBtn = document.getElementById('edit-card-btn');
    
    // Creator Toggle
    const toggleCreatorBtn = document.getElementById('toggle-creator-btn');
    const creatorForm = document.getElementById('flashcard-creator');
    const cancelCreatorBtn = document.getElementById('cancel-creator-btn');
    const saveCardBtn = document.getElementById('save-card-btn');
    
    const fcWordInput = document.getElementById('fc-word');
    const fcDefinitionInput = document.getElementById('fc-definition');
    const fcExampleInput = document.getElementById('fc-example');

    let currentCard = null;

    // Toggle Creator Form
    if (toggleCreatorBtn) {
        toggleCreatorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            creatorForm.classList.add('active');
            cardWrapper.style.display = 'none';
            fcControls.style.display = 'none';
        });
    }

    if (cancelCreatorBtn) {
        cancelCreatorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeCreator();
        });
    }

    function closeCreator() {
        creatorForm.classList.remove('active');
        cardWrapper.style.display = 'block';
        fcControls.style.display = 'flex';
        // Clear inputs
        fcWordInput.value = '';
        fcDefinitionInput.value = '';
        fcExampleInput.value = '';
    }

    // Save Card
    if (saveCardBtn) {
        saveCardBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const word = fcWordInput.value.trim();
            const definition = fcDefinitionInput.value.trim();
            const example = fcExampleInput.value.trim();

            if (!word || !definition) {
                alert('Word and Definition are required.');
                return;
            }

            try {
                const res = await window.apiPost('/flashcards/api/create/', {
                    word,
                    definition,
                    example
                });
                if (res.status === 'success') {
                    // Update counts
                    const total = parseInt(totalCountDisplay.textContent) || 0;
                    totalCountDisplay.textContent = total + 1;
                    
                    const due = parseInt(dueCountDisplay.textContent) || 0;
                    dueCountDisplay.textContent = due + 1;

                    closeCreator();
                    
                    // If we were on empty state, load the new card
                    if (!currentCard) {
                        loadNextCard();
                    }
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Load next card
    async function loadNextCard() {
        // Reset flip state
        cardSection.classList.remove('flipped');
        ratingButtons.style.display = 'none';
        flipBtn.style.display = 'block';
        fcControls.style.display = 'flex';

        try {
            const res = await fetch('/flashcards/api/next/');
            const data = await res.json();
            
            if (data.status === 'success') {
                currentCard = data.card;
                cardWord.textContent = currentCard.word;
                cardDefinition.textContent = currentCard.definition;
                cardExample.textContent = currentCard.example ? `"${currentCard.example}"` : '';
                
                // If it's a card from general bank (not strictly due), styling can adjust slightly
                if (!currentCard.is_due) {
                    cardWord.innerHTML = `${currentCard.word} <span style="font-size:0.7rem; color:var(--text-secondary); display:block; font-weight:normal;">(Practice Mode)</span>`;
                }
                if (editCardBtn) {
                    editCardBtn.style.display = 'inline-block';
                }
            } else if (data.status === 'empty') {
                currentCard = null;
                cardWord.textContent = 'No cards available. Create one!';
                cardDefinition.textContent = '';
                cardExample.textContent = '';
                fcControls.style.display = 'none';
                if (editCardBtn) {
                    editCardBtn.style.display = 'none';
                }
            }
        } catch (err) {
            console.error('Failed to load card:', err);
        }
    }

    // Flip card toggle
    if (cardWrapper) {
        cardWrapper.addEventListener('click', () => {
            if (!currentCard) return;
            cardSection.classList.toggle('flipped');
            
            // Adjust buttons on flip
            const isFlipped = cardSection.classList.contains('flipped');
            if (isFlipped) {
                flipBtn.style.display = 'none';
                ratingButtons.style.display = 'flex';
            } else {
                flipBtn.style.display = 'block';
                ratingButtons.style.display = 'none';
            }
        });
    }

    if (flipBtn) {
        flipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!currentCard) return;
            cardSection.classList.add('flipped');
            flipBtn.style.display = 'none';
            ratingButtons.style.display = 'flex';
        });
    }

    // Rating submits
    async function submitRating(wasCorrect) {
        if (!currentCard) return;
        try {
            const res = await window.apiPost('/flashcards/api/answer/', {
                id: currentCard.id,
                was_correct: wasCorrect
            });
            if (res.status === 'success') {
                dueCountDisplay.textContent = res.due_count;
                
                // Add flip-back animation delay, then load next card
                cardSection.classList.remove('flipped');
                setTimeout(() => {
                    loadNextCard();
                }, 300);
            }
        } catch (err) {
            console.error(err);
        }
    }

    if (answerCorrectBtn) {
        answerCorrectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            submitRating(true);
        });
    }

    if (answerWrongBtn) {
        answerWrongBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            submitRating(false);
        });
    }

    if (editCardBtn) {
        editCardBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentCard) return;

            const newWord = prompt('Edit Word:', currentCard.word);
            if (newWord === null || newWord.trim() === '') return;

            const newDefinition = prompt('Edit Definition:', currentCard.definition);
            if (newDefinition === null || newDefinition.trim() === '') return;

            const newExample = prompt('Edit Example Sentence (Optional):', currentCard.example || '');
            if (newExample === null) return;

            try {
                const res = await window.apiPost('/flashcards/api/update/', {
                    id: currentCard.id,
                    word: newWord.trim(),
                    definition: newDefinition.trim(),
                    example: newExample.trim()
                });
                if (res.status === 'success') {
                    currentCard = res.card;
                    cardWord.textContent = currentCard.word;
                    cardDefinition.textContent = currentCard.definition;
                    cardExample.textContent = currentCard.example ? `"${currentCard.example}"` : '';
                    if (!currentCard.is_due) {
                        cardWord.innerHTML = `${currentCard.word} <span style="font-size:0.7rem; color:var(--text-secondary); display:block; font-weight:normal;">(Practice Mode)</span>`;
                    }
                }
            } catch (err) {
                console.error(err);
                alert('Failed to edit card.');
            }
        });
    }

    // Initial load
    loadNextCard();
});
