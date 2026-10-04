// Browser check (not part of `npm test`): the REAL game scene vs the headless replay.
// Plays several seeds through the actual Game scene, exports its tap log, replays it with RunSim in node and
// compares the outcome. Needs a served build (vite build; python3 -m http.server 8766 --directory dist) and playwright.
import { createRequire } from 'module';
import { replayRun } from '../../src/core/runsim.js';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8766/index.html';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let fails = 0;
const cases = [[7, 160, 0], [104729, 220, 1], [2718281, 300, 0], [31337, 200, 1], [99991, 260, 0], [42, 350, 1]];
for (const [seed, quitM, revive] of cases) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 760 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${URL}?play=1&seed=${seed}&z=1`);
  await page.waitForTimeout(1200);
  const out = await page.evaluate(async ({ quitM, revive }) => {
    const game = window.__tappyGame, T = window.__tappy;
    game.loop.stop();
    const scene = T.scene;
    T.ad.showRewarded = async () => ({ rewarded: true, txId: 'test' });
    let t = 1000, last = -9, revived = 0, r = 7;
    const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const frame = () => { t += 1000 / 60; scene.update(t, 1000 / 60); };
    const PLm = 14; // body half width, only used for steering clamp
    for (let f = 0; f < 60000; f++) {
      if (scene.phase === 'OVER') {
        if (revive && !revived && scene.run.canNormalRevive) { scene.tryRevive(); revived = 1; await new Promise((r) => setTimeout(r, 50)); for (let k = 0; k < 5; k++) frame(); continue; }
        break;
      }
      if (scene.phase !== 'PLAY') { frame(); continue; }
      const b = scene.body, sim = scene.sim;
      if (b.canJump && (b.state === 'RESTING' || (b.vy > 120 && sim.simT - last > 0.12 + rnd() * 0.05))) {
        if (sim.run.maxHeightM >= quitM) scene.tryJump(0);
        else {
          const tx = sim.gen.corridorX(b.y - 80);
          const px = (d) => Math.min(360 - PLm, Math.max(PLm, b.x + d * 150 * 0.3));
          let best = 0;
          for (const d of [0, -1, 1]) if (Math.abs(px(d) - tx) < Math.abs(px(best) - tx) - 1) best = d;
          scene.tryJump(rnd() < 0.04 ? 0 : best);
        }
        last = sim.simT;
      }
      frame();
    }
    return { over: scene.phase === 'OVER', rec: scene.sim.exportReplay(), heightM: Math.floor(scene.run.maxHeightM), coins: scene.run.coins, lives: scene.run.lives, ad: scene.run.normalReviveUsed };
  }, { quitM, revive });
  const rep = replayRun(out.rec);
  const good = out.over && rep.ok && rep.heightM === out.heightM && rep.coins === out.coins && rep.ticks === out.rec.ticks && rep.revives.ad === out.ad;
  if (!good || errs.length) fails++;
  console.log(`${good && !errs.length ? 'PASS' : 'FAIL'} seed ${seed}: game ${out.heightM} m / ${out.coins} coins / ${out.rec.ticks} ticks / ${out.rec.taps.length} taps / revive ${out.ad}  |  replay ${rep.ok ? `${rep.heightM} m / ${rep.coins} coins / ${rep.ticks} ticks` : 'REJECTED ' + rep.reason}${errs.length ? ' ERRORS ' + errs.join('|') : ''}`);
  await page.close();
}
await browser.close();
console.log(fails ? `equivalence: ${fails} FAILED` : 'equivalence: game and replay agree');
process.exit(fails ? 1 : 0);
