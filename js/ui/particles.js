/** tsParticles background — neural starfield */

/** @type {boolean} */
let initialized = false;

/** @type {Promise<void> | null} */
let scriptPromise = null;

const CDN_V3_ALL = 'https://cdn.jsdelivr.net/npm/@tsparticles/all@3/tsparticles.all.bundle.min.js';
const CDN_V2 = 'https://cdn.jsdelivr.net/npm/tsparticles@2/tsparticles.bundle.min.js';

/**
 * @param {string} src
 * @param {string} label
 * @returns {Promise<void>}
 */
function loadScript(src, label) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-tsparticles="${label}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${label}`)));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.dataset.tsparticles = label;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${label} from ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * @returns {Promise<void>}
 */
function loadTsParticlesScript() {
  if (!scriptPromise) {
    scriptPromise = loadScript(CDN_V3_ALL, 'v3-all');
  }
  return scriptPromise;
}

/**
 * @param {boolean} isMobile
 * @param {boolean} reducedMotion
 * @param {boolean} [useAttract=true]
 * @returns {object}
 */
function buildParticleOptions(isMobile, reducedMotion, useAttract = true) {
  const linksEnabled = !isMobile && !reducedMotion;
  const motionEnabled = !reducedMotion;
  const hoverMode = useAttract ? 'attract' : 'repulse';

  return {
    fullScreen: {
      enable: false,
      zIndex: 0,
    },
    fpsLimit: 60,
    detectRetina: true,
    background: {
      opacity: 0,
    },
    particles: {
      number: {
        value: isMobile ? 40 : 80,
        density: {
          enable: true,
          width: 1920,
          height: 1080,
        },
      },
      color: {
        value: ['#3b82f6', '#7c3aed', '#a78bfa', '#ffffff'],
      },
      shape: {
        type: 'circle',
      },
      opacity: {
        value: { min: 0.3, max: 0.8 },
        animation: {
          enable: motionEnabled,
          speed: 1,
          sync: false,
        },
      },
      size: {
        value: { min: 1, max: 3 },
      },
      move: {
        enable: motionEnabled,
        speed: 0.5,
        direction: 'none',
        random: true,
        straight: false,
        outModes: {
          default: 'out',
        },
      },
      links: {
        enable: linksEnabled,
        distance: 120,
        color: '#7c3aed',
        opacity: 0.15,
        width: 1,
      },
    },
    interactivity: {
      detectsOn: 'window',
      events: {
        onHover: {
          enable: motionEnabled,
          mode: hoverMode,
        },
        onClick: {
          enable: false,
        },
        resize: true,
      },
      modes: {
        attract: {
          distance: 200,
          duration: 0.4,
          speed: 1.2,
          factor: 3,
          maxSpeed: 50,
        },
        repulse: {
          distance: 150,
          duration: 0.4,
          speed: 1,
        },
      },
    },
  };
}

/**
 * @param {boolean} isMobile
 * @param {boolean} reducedMotion
 * @returns {object}
 */
function buildV2Options(isMobile, reducedMotion) {
  const linksEnabled = !isMobile && !reducedMotion;
  const motionEnabled = !reducedMotion;

  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    detectRetina: true,
    background: { opacity: 0 },
    particles: {
      number: {
        value: isMobile ? 40 : 80,
        density: { enable: true, area: 900 },
      },
      color: { value: ['#3b82f6', '#7c3aed', '#a78bfa', '#ffffff'] },
      shape: { type: 'circle' },
      opacity: {
        value: { min: 0.3, max: 0.8 },
        animation: { enable: motionEnabled, speed: 1, sync: false },
      },
      size: { value: { min: 1, max: 3 } },
      move: {
        enable: motionEnabled,
        speed: 0.5,
        direction: 'none',
        random: true,
        straight: false,
        outModes: { default: 'out' },
      },
      links: {
        enable: linksEnabled,
        distance: 120,
        color: '#7c3aed',
        opacity: 0.15,
        width: 1,
      },
    },
    interactivity: {
      detectsOn: 'window',
      events: {
        onHover: { enable: motionEnabled, mode: 'repulse' },
        resize: true,
      },
      modes: {
        repulse: { distance: 150, duration: 0.4, speed: 1 },
      },
    },
  };
}

/**
 * @param {object} options
 * @returns {Promise<void>}
 */
async function loadWithV3(options) {
  const tsParticles = window.tsParticles;
  if (!tsParticles) {
    throw new Error('window.tsParticles missing after v3 script load');
  }

  if (typeof window.loadAll === 'function') {
    await window.loadAll(tsParticles);
  } else {
    console.warn('[particles] window.loadAll not found — plugins may be incomplete');
  }

  await tsParticles.load({
    id: 'particles-bg',
    options,
  });
}

/**
 * @param {object} options
 * @returns {Promise<void>}
 */
async function loadWithV2(options) {
  await loadScript(CDN_V2, 'v2-fallback');
  const tsParticles = window.tsParticles;
  if (!tsParticles) {
    throw new Error('window.tsParticles missing after v2 script load');
  }
  await tsParticles.load('particles-bg', options);
}

/**
 * @returns {Promise<void>}
 */
export async function initParticles() {
  const container = document.getElementById('particles-bg');
  if (!container || initialized) {
    return;
  }

  const isMobile = window.matchMedia('(max-width: 639px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    container.style.display = 'none';
    return;
  }

  try {
    await loadTsParticlesScript();
    await loadWithV3(buildParticleOptions(isMobile, reducedMotion, true));
    initialized = true;
    console.log('[particles] Initialized (v3 + attract)');
  } catch (v3Error) {
    console.error('[particles] Init failed (v3):', v3Error);
    try {
      await loadWithV2(buildV2Options(isMobile, reducedMotion));
      initialized = true;
      console.log('[particles] Initialized (v2 fallback + repulse hover)');
    } catch (v2Error) {
      console.error('[particles] Init failed (v2 fallback):', v2Error);
    }
  }

  if (!initialized) {
    return;
  }

  let resizeTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(async () => {
      const mobile = window.matchMedia('(max-width: 639px)').matches;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        if (typeof window.loadAll === 'function') {
          await loadWithV3(buildParticleOptions(mobile, reduced, true));
        } else {
          await window.tsParticles?.load('particles-bg', buildV2Options(mobile, reduced));
        }
      } catch (error) {
        console.warn('[particles] Resize reload failed:', error);
      }
    }, 300);
  });
}

export default { initParticles };
