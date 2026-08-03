const STORAGE_KEY = 'jarvis-alerts-enabled';

let audioCtx = null;
let unlocked = false;

export function alertsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAlertsEnabled(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Sem localStorage disponivel (modo privado, etc.) - preferencia nao persiste, mas nao quebra a app.
  }
}

export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    unlocked = true;
  } catch {
    unlocked = false;
  }
}

export function playAlertTone() {
  if (!unlocked || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    [0, 0.22].forEach((offset, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = index === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    // Falha ao tocar som nao deve interromper a operacao do painel.
  }
}
