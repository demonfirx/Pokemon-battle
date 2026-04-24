/**
 * perf.js — Performance utilities for Pokemon Battle
 * Sprite preloader, DOM cache/pool, debounce/throttle, perf marks
 */

/* === SECTION: Debug Flag === */
const DEBUG = window.location.hostname === 'localhost' || window.location.search.includes('debug=1');

function debugLog(...args) {
  if (DEBUG) console.log('[perf]', ...args);
}

/* === SECTION: Sprite Preloader === */
const SpritePreloader = (() => {
  const cache = new Map();
  let preloadQueue = [];
  let isPreloading = false;

  /**
   * Preload a single image URL, returns a promise
   */
  function preloadOne(url) {
    if (cache.has(url)) return cache.get(url);

    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        debugLog('Preloaded:', url);
        resolve(img);
      };
      img.onerror = () => {
        debugLog('Failed to preload:', url);
        resolve(null); // Don't reject — graceful fallback
      };
      img.src = url;
    });

    cache.set(url, promise);
    return promise;
  }

  /**
   * Preload all sprites for a list of pokemon
   * @param {Array} pokemonList - Array of pokemon objects with id/name
   * @param {Object} spriteIds - Map of name -> sprite ID
   * @param {Function} onProgress - Callback(loaded, total)
   */
  async function preloadAll(pokemonList, spriteIds, onProgress) {
    if (isPreloading) return;
    isPreloading = true;

    const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
    const SPRITE_BACK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/';
    const ANIMATED_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/';
    const ANIMATED_BACK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/';

    const urls = [];
    for (const poke of pokemonList) {
      const name = (poke.name || '').toLowerCase();
      const id = spriteIds[name] || poke.spriteId || poke.id;
      // Static front + back
      urls.push(`${SPRITE_URL}${id}.png`);
      urls.push(`${SPRITE_BACK_URL}${id}.png`);
      // Animated front + back
      urls.push(`${ANIMATED_URL}${id}.gif`);
      urls.push(`${ANIMATED_BACK_URL}${id}.gif`);
    }

    let loaded = 0;
    const total = urls.length;

    // Load in batches of 6 to avoid overwhelming the browser
    const BATCH_SIZE = 6;
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(url => {
        return preloadOne(url).then(() => {
          loaded++;
          if (onProgress) onProgress(loaded, total);
        });
      }));
    }

    isPreloading = false;
    debugLog(`Preloaded ${loaded}/${total} sprites`);
  }

  /**
   * Check if a URL is already cached
   */
  function isCached(url) {
    return cache.has(url);
  }

  return { preloadOne, preloadAll, isCached };
})();


/* === SECTION: DOM Element Cache === */
const DOMCache = (() => {
  const cache = new Map();

  /**
   * Get element by ID, cached
   */
  function get(id) {
    if (cache.has(id)) return cache.get(id);
    const el = document.getElementById(id);
    if (el) cache.set(id, el);
    return el;
  }

  /**
   * Clear cache (call on screen transitions if DOM changes)
   */
  function clear() {
    cache.clear();
  }

  /**
   * Warm up cache with commonly used IDs
   */
  function warmup(ids) {
    for (const id of ids) {
      get(id);
    }
  }

  return { get, clear, warmup };
})();


/* === SECTION: Object Pool for Damage Numbers === */
const DamageNumberPool = (() => {
  const pool = [];
  const MAX_POOL_SIZE = 10;

  /**
   * Get a damage number element (reuse from pool or create new)
   */
  function acquire() {
    if (pool.length > 0) {
      const el = pool.pop();
      el.className = 'damage-number';
      el.textContent = '';
      return el;
    }
    // Create new
    const el = document.createElement('div');
    el.className = 'damage-number hidden';
    return el;
  }

  /**
   * Return element to pool for reuse
   */
  function release(el) {
    el.className = 'damage-number hidden';
    el.textContent = '';
    if (pool.length < MAX_POOL_SIZE) {
      pool.push(el);
    }
  }

  return { acquire, release };
})();


/* === SECTION: Debounce / Throttle === */

/**
 * Debounce: delay execution until after wait ms of inactivity
 */
function debounce(fn, wait = 200) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttle: execute at most once per wait ms
 */
function throttle(fn, wait = 100) {
  let lastTime = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    if (remaining <= 0) {
      clearTimeout(timer);
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}


/* === SECTION: Performance Marks (dev only) === */
const PerfMark = (() => {
  function start(label) {
    if (!DEBUG) return;
    performance.mark(`${label}-start`);
  }

  function end(label) {
    if (!DEBUG) return;
    performance.mark(`${label}-end`);
    try {
      performance.measure(label, `${label}-start`, `${label}-end`);
      const measure = performance.getEntriesByName(label).pop();
      if (measure) {
        debugLog(`⏱ ${label}: ${measure.duration.toFixed(2)}ms`);
      }
    } catch (e) {
      // Ignore if marks don't exist
    }
  }

  return { start, end };
})();


/* === SECTION: Batch DOM Updates === */

/**
 * Create a DocumentFragment for batch DOM insertions
 * Usage: const frag = createFragment(); frag.appendChild(...); container.appendChild(frag);
 */
function createFragment() {
  return document.createDocumentFragment();
}
