document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => {
    card.querySelector('.inner').classList.toggle('flipped');
  });
});
