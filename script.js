const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = 1996;
}

function handleNotify(event) {
  event.preventDefault();
  const emailInput = document.getElementById('email');
  const value = emailInput?.value?.trim();

  if (value) {
    alert('Thanks! You are on the list.');
    emailInput.value = '';
  }
}
