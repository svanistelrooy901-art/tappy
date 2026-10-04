// Real-money purchases, isolated behind this interface (same idea as ad.js).
// PROTOTYPE: the mock below simulates the store sheet so the whole flow is testable.
// Android build: replace `purchase` with Google Play Billing (Capacitor plugin). The rest of the game does not change.
//
// purchase(sku) -> { ok: true, txId } | { ok: false, reason: 'cancelled' | 'failed' }
export const StoreService = {
  mock: { outcome: null }, // set by the scene to show a test purchase sheet and resolve 'complete' | 'cancel' | 'fail'

  async purchase(sku) {
    const outcome = this.mock.outcome ? await this.mock.outcome(sku) : 'complete';
    if (outcome === 'complete') return { ok: true, txId: `test-${sku}-${Date.now().toString(36)}` };
    return { ok: false, reason: outcome === 'cancel' ? 'cancelled' : 'failed' };
  },
};
