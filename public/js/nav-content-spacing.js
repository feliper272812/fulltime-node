(() => {
  const navbar = document.querySelector('nav.navbar.fixed-top');
  const main = document.querySelector('main');
  const fallbackContent = document.querySelector('.pdv-container, body > .card-custom');
  const content = main || fallbackContent;

  if (!navbar || !content) return;

  let animationFrame = 0;

  const updateLayout = () => {
    if (animationFrame) return;

    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      const navbarHeight = Math.ceil(navbar.getBoundingClientRect().bottom);

      document.body.style.setProperty('padding-top', `${navbarHeight}px`, 'important');
      document.documentElement.style.setProperty('--navbar-height', `${navbarHeight}px`);

      if (main) {
        main.style.setProperty('padding-top', '2px', 'important');
        if (main.firstElementChild) {
          main.firstElementChild.style.setProperty('margin-top', '0px', 'important');
        }
      } else {
        content.style.setProperty('margin-top', '2px', 'important');
      }
    });
  };

  updateLayout();
  window.addEventListener('resize', updateLayout);

  if ('ResizeObserver' in window) {
    new ResizeObserver(updateLayout).observe(navbar);
  }
})();
