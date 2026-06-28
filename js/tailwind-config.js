/** Tailwind CDN theme — loaded after cdn.tailwindcss.com (CSP: no inline scripts) */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'space-void': '#0c0c2a',
        'nebula-deep': '#161438',
        'synapse-blue': '#3b82f6',
        'pulse-violet': '#7c3aed',
        'neural-glow': '#a78bfa',
        'starfield-white': '#b8b4c8',
        'dim-text': '#8c889e',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
