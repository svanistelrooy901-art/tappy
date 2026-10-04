// AdService: the ONLY place the game touches an ad network. Swap the provider here (AdMob via
// Capacitor later) without touching GameScene or UI.
//
// Contract: showRewarded() resolves { rewarded: boolean, txId: string|null, reason?: string }.
// A revive is granted ONLY when rewarded === true. Failure, close or decline => no reward.

let txCounter = 0;

export const AdService = {
  provider: 'mock',

  // Mock used in dev/playtest. `controller` lets the UI decide the outcome so QA can test every path.
  mock: {
    // set by the scene: returns a promise of 'complete' | 'close' | 'fail'
    outcome: null,
  },

  async showRewarded() {
    const result = this.mock.outcome ? await this.mock.outcome() : 'complete';
    if (result === 'complete') {
      txCounter += 1;
      return { rewarded: true, txId: `mock-${Date.now()}-${txCounter}` };
    }
    return { rewarded: false, txId: null, reason: result };
  },
};
