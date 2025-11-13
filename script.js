// Wait for the CSS animation to finish and then remove it
// so the gradient stays put without an active animation.
const gradient = document.querySelector('.gradient-bg');

if (gradient) {
  gradient.addEventListener('animationend', () => {
    gradient.style.animation = 'none';
  });
}


