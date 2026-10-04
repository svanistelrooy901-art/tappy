// AdService: the ONLY place the game touches an ad network.
//
// Contract: showRewarded() resolves { rewarded: boolean, txId: string|null, reason?: string }.
// A revive is granted ONLY when rewarded === true, i.e. after the network confirms the reward was earned.
// Failure, early close or decline => no reward.
//
// Providers: 'admob' inside the Android/iOS app (Capacitor), 'mock' in the browser/PWA (dev + playtest).

import { CFG } from '../config.js';

let txCounter = 0;

const isNative = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

let admob = null; // the plugin module, loaded lazily so the web build never needs it
let initPromise = null;
let ready = false; // a rewarded ad is loaded and can be shown instantly
let loadP = null; // the load in flight, shared by everyone who needs the ad
let retryTimer = null;

async function initAdMob() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mod = await import('@capacitor-community/admob');
    admob = mod;
    await mod.AdMob.initialize({ initializeForTesting: CFG.ads.testing });
    return true;
  })().catch((e) => {
    console.warn('AdMob init failed', e);
    initPromise = null;
    return false;
  });
  return initPromise;
}

// Load the next rewarded ad in the background so it is ready BEFORE the player asks for it.
// A failed load retries quietly (slow networks), never more often than CFG.ads.retryS.
function load() {
  if (ready) return Promise.resolve(true);
  if (loadP) return loadP;
  loadP = (async () => {
    if (!(await initAdMob())) return false;
    try {
      await admob.AdMob.prepareRewardVideoAd({ adId: CFG.ads.rewardedId, isTesting: CFG.ads.testing });
      ready = true;
      return true;
    } catch (e) {
      console.warn('AdMob load failed', e);
      return false;
    }
  })().then((ok) => {
    loadP = null;
    if (!ok && !retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; load(); }, CFG.ads.retryS * 1000);
    }
    return ok;
  });
  return loadP;
}

const sleep = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

// Show one rewarded ad via AdMob. Resolves rewarded=true only on the network's Rewarded event.
// opts.isCancelled(): checked after waiting for the load, so a cancelled request never pops an ad later.
// opts.onShow(): called right before the ad goes on screen (the scene hides its "loading" card then).
async function showAdMob(opts = {}) {
  if (!ready) {
    // not preloaded (first run, slow network): wait for it, but never forever
    const got = await Promise.race([load(), sleep(CFG.ads.loadTimeoutS * 1000, 'timeout')]);
    if (got === 'timeout') return { rewarded: false, txId: null, reason: 'timeout' };
    if (!got) return { rewarded: false, txId: null, reason: 'fail' };
  }
  if (opts.isCancelled?.()) return { rewarded: false, txId: null, reason: 'cancel' };

  const { AdMob, RewardAdPluginEvents } = admob;
  const handles = [];
  let earned = false;
  try {
    const done = new Promise((resolve) => {
      const on = async (ev, fn) => handles.push(await AdMob.addListener(ev, fn));
      on(RewardAdPluginEvents.Rewarded, () => { earned = true; });
      on(RewardAdPluginEvents.Dismissed, () => resolve('dismissed'));
      on(RewardAdPluginEvents.FailedToShow, () => resolve('fail'));
    });
    await sleep(0); // let the listeners register
    ready = false; // this ad is spent whatever happens
    opts.onShow?.();
    AdMob.showRewardVideoAd().catch(() => {});
    const how = await Promise.race([done, sleep(90000, 'timeout')]);
    if (earned) {
      txCounter += 1;
      return { rewarded: true, txId: `admob-${Date.now()}-${txCounter}` };
    }
    return { rewarded: false, txId: null, reason: how === 'dismissed' ? 'close' : how };
  } catch (e) {
    console.warn('AdMob rewarded failed', e);
    return { rewarded: false, txId: null, reason: 'fail' };
  } finally {
    handles.forEach((h) => h?.remove?.());
    ready = false;
    setTimeout(load, 800); // queue the next one
  }
}

export const AdService = {
  get provider() { return isNative() ? 'admob' : 'mock'; },

  // Mock used in the browser/PWA. `outcome` lets the UI decide the result so QA can test every path.
  mock: {
    // set by the scene: returns a promise of 'complete' | 'close' | 'fail'
    outcome: null,
  },

  // call at app start and at the start of each run: loads the ad in the background
  warmUp() {
    if (isNative()) load();
  },

  // true when showRewarded() will start instantly (always true for the mock)
  isReady() {
    return isNative() ? ready : true;
  },

  async showRewarded(opts = {}) {
    if (isNative()) return showAdMob(opts);
    const result = this.mock.outcome ? await this.mock.outcome() : 'complete';
    if (result === 'complete') {
      txCounter += 1;
      return { rewarded: true, txId: `mock-${Date.now()}-${txCounter}` };
    }
    return { rewarded: false, txId: null, reason: result };
  },
};
