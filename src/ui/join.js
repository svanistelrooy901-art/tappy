// HTML overlays for the leaderboard identity: join (nickname + country), show the recovery code, restore on a new phone.
// Plain DOM on top of the canvas because phones need a real text field and keyboard for typing a nickname.
import { Online, countryList } from '../services/online.js';

const MSG = {
  nick_short: 'Too short (at least 3 characters)',
  nick_long: 'Too long (up to 12 characters)',
  nick_chars: 'Use letters, numbers, . _ - (no spaces) with at least one letter',
  nick_reserved: 'That name is reserved',
  nick_blocked: "That name isn't allowed",
  nick_taken: 'Already taken. Try another',
  nick_format: 'Enter a nickname',
  country: 'Pick your country',
  network: 'No connection. Check your internet and try again',
  rate_limited: 'Too many tries. Please wait a bit',
  code_format: "That doesn't look like a recovery code (TAPPY-XXXX-XXXX)",
  code_unknown: 'No account found for that code',
  failed: 'Something went wrong. Try again',
};
const say = (e) => MSG[e] || MSG.failed;

const CSS = `
#tp-modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,2,15,.76);font-family:Fredoka,system-ui,sans-serif;color:#fff;-webkit-user-select:text;user-select:text;touch-action:manipulation}
#tp-modal *{box-sizing:border-box}
#tp-card{width:100%;max-width:340px;max-height:100%;overflow:auto;border-radius:22px;padding:22px 20px 18px;background:linear-gradient(180deg,#43318f 0%,#1d1352 100%);border:1px solid rgba(190,170,255,.28);box-shadow:0 18px 50px rgba(0,0,0,.55)}
#tp-card h2{margin:0 0 4px;font-size:24px;font-weight:700;text-align:center}
#tp-card p{margin:0 0 12px;font-size:14px;line-height:1.35;color:#cfc8ff;text-align:center;font-weight:500}
#tp-card label{display:block;margin:10px 0 4px;font-size:13px;font-weight:600;color:#b9aef5}
#tp-card input,#tp-card select{width:100%;height:46px;border-radius:12px;border:1.5px solid rgba(190,170,255,.35);background:#120a3a;color:#fff;font:600 17px Fredoka,system-ui,sans-serif;padding:0 14px;outline:none}
#tp-card input:focus,#tp-card select:focus{border-color:#8fe3ff}
#tp-card .st{min-height:20px;margin:5px 2px 0;font-size:13px;font-weight:600;color:#b9aef5}
#tp-card .st.bad{color:#ff9db2}#tp-card .st.good{color:#7dffb0}
#tp-card .warn{margin:12px 0 4px;padding:10px 12px;border-radius:12px;background:rgba(255,200,90,.12);border:1px solid rgba(255,200,90,.45);color:#ffe3a1;font-size:13px;line-height:1.35;font-weight:500}
#tp-card button{width:100%;height:50px;margin-top:10px;border:0;border-radius:14px;font:700 18px Fredoka,system-ui,sans-serif;color:#fff;cursor:pointer;background:linear-gradient(180deg,#35d98a,#18a865);box-shadow:0 3px 0 #0f7a49}
#tp-card button:disabled{opacity:.45;box-shadow:none;cursor:default}
#tp-card button.ghost{background:transparent;box-shadow:none;border:1.5px solid rgba(190,170,255,.4);color:#d9d2ff;height:44px;font-size:16px}
#tp-card button.link{background:none;box-shadow:none;height:36px;font-size:14px;color:#8fe3ff;font-weight:600;margin-top:4px}
#tp-card .code{margin:10px 0 4px;padding:14px 8px;border-radius:14px;background:#120a3a;border:1.5px dashed rgba(255,216,106,.6);color:#ffd86a;font:700 26px ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;text-align:center;user-select:all;-webkit-user-select:all}
`;

function mount() {
  if (!document.getElementById('tp-style')) {
    const st = document.createElement('style');
    st.id = 'tp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  document.getElementById('tp-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tp-modal';
  const card = document.createElement('div');
  card.id = 'tp-card';
  modal.appendChild(card);
  document.body.appendChild(modal);
  return { modal, card, close: () => modal.remove() };
}
const $ = (card, s) => card.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- join
export function openJoin({ onDone, onCancel } = {}) {
  const { card, close } = mount();
  const countries = countryList();
  card.innerHTML = `
    <h2>Join the ranks</h2>
    <p>Pick a nickname and your country. Everyone sees them on the leaderboard.</p>
    <label for="tp-nick">Nickname</label>
    <input id="tp-nick" maxlength="12" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="3 to 12 characters">
    <div class="st" id="tp-st">Letters, numbers, . _ -</div>
    <label for="tp-cty">Country</label>
    <select id="tp-cty"><option value="">Choose your country</option>${countries.map((c) => `<option value="${c.code}">${c.flag}  ${esc(c.name)}</option>`).join('')}</select>
    <div class="warn"><b>Heads up:</b> your nickname and country are permanent. You can't change them later, so choose carefully.</div>
    ${Online.isMock ? '<div class="st" style="text-align:center">Test mode: this account lives only on this device</div>' : ''}
    <button id="tp-go" disabled>Join</button>
    <button class="ghost" id="tp-restore">I already have a recovery code</button>
    <button class="link" id="tp-cancel">Not now</button>`;
  const nick = $(card, '#tp-nick'), st = $(card, '#tp-st'), cty = $(card, '#tp-cty'), go = $(card, '#tp-go');
  let nickOk = false, timer = null, seq = 0;
  const update = () => { go.disabled = !(nickOk && cty.value); };
  const setSt = (t, kind = '') => { st.textContent = t; st.className = 'st ' + kind; };
  nick.addEventListener('input', () => {
    nickOk = false;
    update();
    clearTimeout(timer);
    const v = nick.value.trim();
    if (!v) return setSt('Letters, numbers, . _ -');
    const my = ++seq;
    timer = setTimeout(async () => {
      const r = await Online.checkNick(v);
      if (my !== seq) return;
      if (!r.ok) return setSt(say(r.reason), 'bad');
      if (r.available === false) return setSt(say(r.reason), 'bad');
      nickOk = true;
      setSt(r.available === null ? 'Looks fine (will be checked when you join)' : '✓ Available', 'good');
      update();
    }, 280);
  });
  cty.addEventListener('change', update);
  go.addEventListener('click', async () => {
    go.disabled = true;
    go.textContent = 'Joining...';
    const r = await Online.register(nick.value.trim(), cty.value);
    if (!r.ok) {
      go.textContent = 'Join';
      setSt(say(r.error), 'bad');
      nickOk = r.error !== 'nick_taken' && !String(r.error).startsWith('nick_');
      update();
      return;
    }
    showRecoveryCode({ profile: r.profile, firstTime: true, onDone: () => { onDone?.(r.profile); }, card, close });
  });
  $(card, '#tp-restore').addEventListener('click', () => { close(); openRestore({ onDone, onCancel }); });
  $(card, '#tp-cancel').addEventListener('click', () => { close(); onCancel?.(); });
  setTimeout(() => nick.focus(), 50);
}

// ---------------------------------------------------------------- recovery code (after joining, or later from Settings)
export function showRecoveryCode({ profile, firstTime = false, onDone, card: c, close: cl } = {}) {
  let card = c, close = cl;
  if (!card) ({ card, close } = mount());
  const code = profile?.recoveryCode || Online.profile?.recoveryCode || '';
  card.innerHTML = `
    <h2>${firstTime ? "You're in!" : 'Your recovery code'}</h2>
    <p>${firstTime ? 'Save this code now.' : ''} If you change phone or reinstall, it brings back <b>${esc(profile?.nickname || Online.profile?.nickname || '')}</b> and your score. Anyone with the code can take over your name, so keep it private.</p>
    <div class="code" id="tp-code">${esc(code)}</div>
    <button id="tp-copy" class="ghost">Copy code</button>
    <button id="tp-done">${firstTime ? "I've saved it" : 'Close'}</button>`;
  $(card, '#tp-copy').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    try {
      await navigator.clipboard.writeText(code);
      b.textContent = 'Copied ✓';
    } catch {
      const r = document.createRange();
      r.selectNodeContents($(card, '#tp-code'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      b.textContent = 'Code selected. Copy it';
    }
  });
  $(card, '#tp-done').addEventListener('click', () => { close(); onDone?.(); });
}

// ---------------------------------------------------------------- restore on a new phone
export function openRestore({ onDone, onCancel } = {}) {
  const { card, close } = mount();
  card.innerHTML = `
    <h2>Restore your account</h2>
    <p>Enter the recovery code you saved when you joined.</p>
    <label for="tp-rc">Recovery code</label>
    <input id="tp-rc" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="TAPPY-XXXX-XXXX" maxlength="16">
    <div class="st" id="tp-st"></div>
    <div class="warn">Restoring moves your account to this phone. Your other phone will be signed out.</div>
    <button id="tp-go" disabled>Restore</button>
    <button class="link" id="tp-back">Back</button>`;
  const inp = $(card, '#tp-rc'), st = $(card, '#tp-st'), go = $(card, '#tp-go');
  inp.addEventListener('input', () => { go.disabled = inp.value.replace(/[^A-Za-z0-9]/g, '').length < 13; st.textContent = ''; });
  go.addEventListener('click', async () => {
    go.disabled = true;
    go.textContent = 'Restoring...';
    const r = await Online.recover(inp.value);
    if (!r.ok) {
      go.textContent = 'Restore';
      go.disabled = false;
      st.textContent = say(r.error);
      st.className = 'st bad';
      return;
    }
    close();
    onDone?.(r.profile);
  });
  $(card, '#tp-back').addEventListener('click', () => { close(); onCancel?.(); });
  setTimeout(() => inp.focus(), 50);
}
