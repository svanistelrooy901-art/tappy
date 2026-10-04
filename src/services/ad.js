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

// Show one rewarded ad via AdMob. Resolves rewarded=true only on the network's Rewarded event.
async function showAdMob() {
  if (!(await initAdMob())) return { rewarded: false, txId: null, reason: 'init' };
  const { AdMob, RewardAdPluginEvents } = admob;
  const handles = [];
  let earned = false;
  try {
    const done = new Promise((resolve) => {
      const on = async (ev, fn) => handles.push(await AdMob.addListener(ev, fn));
      on(RewardAdPluginEvents.Rewarded, () => { earned = true; });
      on(RewardAdPluginEvents.Dismissed, () => resolve('dismissed'));
      on(RewardAdPluginEvents.FailedToLoad, () => resolve('fail'));
      on(RewardAdPluginEvents.FailedToShow, () => resolve('fail'));
    });
    await new Promise((r) => setTimeout(r, 0)); // let the listeners register
    await AdMob.prepareRewardVideoAd({ adId: CFG.ads.rewardedId, isTesting: CFG.ads.testing });
    AdMob.showRewardVideoAd().catch(() => {});
    const how = await Promise.race([done, new Promise((r) => setTimeout(() => r('timeout'), 90000))]);
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
  }
}

export const AdService = {
  get provider() { return isNative() ? 'admob' : 'mock'; },

  // Mock used in the browser/PWA. `outcome` lets the UI decide the result so QA can test every path.
  mock: {
    // set by the scene: returns a promise of 'complete' | 'close' | 'fail'
    outcome: null,
  },

  // call once at app start so the first ad is not slowed by SDK start-up
  warmUp() {
    if (isNative()) initAdMob();
  },

  async showRewarded() {
    if (isNative()) return showAdMob();
    const result = this.mock.outcome ? await this.mock.outcome() : 'complete';
    if (result === 'complete') {
      txCounter += 1;
      return { rewarded: true, txId: `mock-${Date.now()}-${txCounter}` };
    }
    return { rewarded: false, txId: null, reason: result };
  },
};
