document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => {
    card.querySelector('.inner').classList.toggle('flipped');
  });
});

const dhPattern = /(\s*\(dh\))$/i;

document.querySelectorAll('.back li').forEach(item => {
  const originalText = item.textContent.trim();

  if (dhPattern.test(originalText)) {
    const cleanedText = originalText.replace(dhPattern, '').trim();
    item.textContent = cleanedText;
    item.classList.add('dh');
  }
});
