/** GSAP animations — page transitions, cards, sidebar */

/** @type {typeof gsap | null} */
let gsapLib = null;

/** @type {Promise<typeof gsap | null>} */
let loadPromise = null;

/**
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @returns {Promise<typeof gsap | null>}
 */
export async function loadGsap() {
  if (prefersReducedMotion()) {
    return null;
  }

  if (gsapLib) {
    return gsapLib;
  }

  if (window.gsap) {
    gsapLib = window.gsap;
    return gsapLib;
  }

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js';
      script.async = true;
      script.onload = () => {
        gsapLib = window.gsap ?? null;
        if (!gsapLib) {
          reject(new Error('GSAP script loaded but window.gsap is missing'));
          return;
        }
        resolve(gsapLib);
      };
      script.onerror = () => reject(new Error('Failed to load GSAP'));
      document.head.appendChild(script);
    });
  }

  return loadPromise;
}

/**
 * @param {boolean} isDashboard
 * @returns {Element | null}
 */
function getPageAnimateTarget(isDashboard) {
  if (isDashboard) {
    return document.getElementById('dashboard-outlet');
  }

  return document.querySelector('#app > main')
    ?? document.querySelector('#app > .dashboard-page')
    ?? document.getElementById('app');
}

/**
 * @param {Element | null} element
 */
export function pageEnter(element) {
  if (!element || prefersReducedMotion()) {
    return;
  }

  if (!gsapLib) {
    element.classList.add('page-enter-active');
    element.addEventListener('animationend', () => {
      element.classList.remove('page-enter-active');
    }, { once: true });
    return;
  }

  gsapLib.fromTo(
    element,
    { opacity: 0, y: 20 },
    {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out',
      immediateRender: true,
      onComplete: () => {
        gsapLib?.set(element, { clearProps: 'opacity,transform' });
      },
    },
  );
}

/**
 * @param {Element[] | NodeListOf<Element>} cards
 */
export function staggerCards(cards) {
  if (!cards?.length || prefersReducedMotion()) {
    return;
  }

  if (!gsapLib) {
    return;
  }

  gsapLib.from(cards, {
    opacity: 0,
    y: 24,
    stagger: 0.06,
    duration: 0.4,
    ease: 'power2.out',
    immediateRender: true,
    clearProps: 'opacity,transform',
  });
}

/**
 * @param {HTMLElement | null} sidebar
 * @param {HTMLElement | null} overlay
 * @param {boolean} open
 */
export async function sidebarSlide(sidebar, overlay, open) {
  if (!sidebar) {
    return;
  }

  if (prefersReducedMotion()) {
    sidebar.classList.toggle('-translate-x-full', !open);
    sidebar.classList.toggle('translate-x-0', open);
    overlay?.classList.toggle('opacity-0', !open);
    overlay?.classList.toggle('pointer-events-none', !open);
    overlay?.classList.toggle('opacity-100', open);
    return;
  }

  const gsap = gsapLib ?? await loadGsap();
  if (!gsap) {
    sidebar.classList.toggle('-translate-x-full', !open);
    sidebar.classList.toggle('translate-x-0', open);
    return;
  }

  if (open) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    gsap.fromTo(sidebar, { x: -260 }, { x: 0, duration: 0.3, ease: 'power2.out' });
    if (overlay) {
      overlay.classList.remove('opacity-0', 'pointer-events-none');
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    }
  } else {
    gsap.to(sidebar, {
      x: -260,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        gsap.set(sidebar, { clearProps: 'transform' });
      },
    });
    if (overlay) {
      gsap.to(overlay, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => {
          overlay.classList.add('opacity-0', 'pointer-events-none');
          overlay.classList.remove('opacity-100');
        },
      });
    }
  }
}

/**
 * @param {boolean} isDashboard
 */
export function runPageAnimations(isDashboard) {
  const target = getPageAnimateTarget(isDashboard);
  pageEnter(target);

  const scope = isDashboard
    ? document.getElementById('dashboard-outlet')
    : document.getElementById('app');

  const cards = scope?.querySelectorAll('.material-card');
  if (cards?.length) {
    staggerCards(cards);
  }
}

export default {
  loadGsap,
  pageEnter,
  staggerCards,
  sidebarSlide,
  runPageAnimations,
  prefersReducedMotion,
};
