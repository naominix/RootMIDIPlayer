import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtmlPath = path.resolve(__dirname, '..', 'index.html');

function extractAppScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2, 'Expected at least 2 inline <script> blocks in index.html');
  return scripts[scripts.length - 1][1];
}

function createSimulatedEnv() {
  const elements = new Map();
  const docListeners = new Map();
  const winListeners = new Map();
  let nowMs = 1000;
  let rafCounter = 1;
  const rafQueue = new Map();

  function makeCanvasCtx() {
    const calls = [];
    return {
      calls,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      shadowColor: '',
      shadowBlur: 0,
      font: '',
      textAlign: '',
      scale(x, y) { calls.push(['scale', x, y]); },
      fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]); },
      beginPath() { calls.push(['beginPath']); },
      moveTo(x, y) { calls.push(['moveTo', x, y]); },
      lineTo(x, y) { calls.push(['lineTo', x, y]); },
      stroke() { calls.push(['stroke']); },
      fill() { calls.push(['fill']); },
      closePath() { calls.push(['closePath']); },
      roundRect(x, y, w, h, r) { calls.push(['roundRect', x, y, w, h, r]); },
      rect(x, y, w, h) { calls.push(['rect', x, y, w, h]); },
      fillText(t, x, y) { calls.push(['fillText', t, x, y]); },
      drawImage(img, x, y, w, h) { calls.push(['drawImage', x, y, w, h]); },
      save() { calls.push(['save']); },
      restore() { calls.push(['restore']); },
      clip() { calls.push(['clip']); }
    };
  }

  function makeElement(tag = 'div', id = '') {
    const listeners = new Map();
    const classSet = new Set();
    const children = [];
    const attrs = new Map();
    const ctx = tag === 'canvas' ? makeCanvasCtx() : null;

    const el = {
      tagName: tag.toUpperCase(),
      id,
      textContent: '',
      value: '',
      checked: true,
      disabled: false,
      width: 600,
      height: 200,
      scrollTop: 0,
      scrollHeight: 100,
      style: {},
      children,
      parentElement: {
        scrollTop: 0,
        scrollHeight: 100,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 200 })
      },
      classList: {
        add(...cls) { cls.forEach(c => classSet.add(c)); },
        remove(...cls) { cls.forEach(c => classSet.delete(c)); },
        contains(c) { return classSet.has(c); }
      },
      set className(val) {
        classSet.clear();
        String(val || '').split(/\s+/).filter(Boolean).forEach(c => classSet.add(c));
        this._rawClassName = val;
      },
      get className() {
        return this._rawClassName || [...classSet].join(' ');
      },
      set innerHTML(val) {
        this._innerHTML = val;
        if (val === '') children.length = 0;
      },
      get innerHTML() {
        return this._innerHTML || '';
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) || null; },
      appendChild(child) {
        child.parentElement = el;
        children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = children.indexOf(child);
        if (idx >= 0) children.splice(idx, 1);
      },
      remove() {
        if (el.parentElement && el.parentElement.children) {
          const idx = el.parentElement.children.indexOf(el);
          if (idx >= 0) el.parentElement.children.splice(idx, 1);
        }
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(type, eventObj = {}) {
        const list = listeners.get(type) || [];
        for (const fn of list) fn({ target: el, preventDefault() {}, ...eventObj });
      },
      querySelector(sel) {
        if (!el._subElements) el._subElements = new Map();
        if (!el._subElements.has(sel)) {
          el._subElements.set(sel, makeElement('div'));
        }
        return el._subElements.get(sel);
      },
      querySelectorAll(sel) {
        if (sel === '.robot-device-card') {
          return children.filter(c => String(c.className).includes('robot-device-card'));
        }
        return [];
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 600, height: 200 };
      },
      getContext() {
        return ctx;
      }
    };
    return el;
  }

  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) {
        const tag = id === 'pianoRollCanvas' ? 'canvas' : 'div';
        elements.set(id, makeElement(tag, id));
      }
      return elements.get(id);
    },
    createElement(tag) {
      return makeElement(tag);
    },
    querySelector(sel) {
      const m = sel.match(/\.robot-device-card\[data-device-id="([^"]+)"\]/);
      if (m) {
        const list = document.getElementById('deviceCardsList');
        return list.children.find(c => c.getAttribute('data-device-id') === m[1]) || null;
      }
      return makeElement('div');
    },
    querySelectorAll(sel) {
      if (sel === '.robot-device-card') {
        const list = document.getElementById('deviceCardsList');
        return list.children.filter(c => String(c.className).includes('robot-device-card'));
      }
      return [];
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(type, ev = {}) {
      for (const fn of (docListeners.get(type) || [])) fn(ev);
    }
  };

  const createdAudioNodes = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    resume() { this.state = 'running'; }
    createOscillator() {
      const node = {
        type: 'square',
        disconnected: false,
        stopped: false,
        onended: null,
        frequency: { setValueAtTime() {} },
        connect() {},
        disconnect() { this.disconnected = true; },
        start() {},
        stop() {
          this.stopped = true;
        }
      };
      createdAudioNodes.push(node);
      return node;
    }
    createGain() {
      const gainNode = {
        disconnected: false,
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          cancelScheduledValues() {}
        },
        connect() {},
        disconnect() { this.disconnected = true; }
      };
      return gainNode;
    }
  }

  const sandbox = {
    window: null,
    document,
    navigator: { bluetooth: {} },
    performance: { now: () => nowMs },
    AudioContext: FakeAudioContext,
    lucide: { createIcons() {} },
    console: { log() {}, warn() {}, error() {} },
    alert() {},
    requestAnimationFrame(cb) {
      const id = rafCounter++;
      rafQueue.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      rafQueue.delete(id);
    },
    setTimeout,
    clearTimeout,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Promise,
    Error,
    RegExp,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    Infinity
  };
  sandbox.window = sandbox;
  sandbox.window.AudioContext = FakeAudioContext;
  sandbox.window.devicePixelRatio = 1;
  sandbox.window.addEventListener = (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  };

  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const scriptCode = extractAppScript(html) + `
    globalThis.__exports = {
      ROOT_BLE, DEVICE_THEMES, PC_THEME, GM_INSTRUMENTS, PRESETS,
      calculateCRC8, createPlayNotePacket, createStopSoundPacket, createSetLightsPacket,
      midiToFreq, midiToName, formatTime,
      monophonizeNotes, extractVoiceFromNotes, foldSequenceForRootPiezo,
      RootRobotDevice, LocalSynth, App, app
    };
  `;

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  sandbox.__exports.app.init();

  return {
    exports: sandbox.__exports,
    document,
    elements,
    createdAudioNodes,
    rafQueue,
    setNow(val) { nowMs = val; },
    advanceTime(dtMs) { nowMs += dtMs; },
    flushOneRaf() {
      const first = rafQueue.entries().next().value;
      if (!first) return false;
      const [id, cb] = first;
      rafQueue.delete(id);
      cb(nowMs);
      return true;
    }
  };
}

function createFakeBleDevice(id, name) {
  const listeners = new Map();
  const writtenPackets = [];
  let writeDelayMs = 0;

  const txChar = {
    async writeValueWithResponse(bytes) {
      if (writeDelayMs > 0) {
        await new Promise(r => setTimeout(r, writeDelayMs));
      }
      writtenPackets.push(new Uint8Array(bytes));
    }
  };
  const rxChar = {
    async startNotifications() {},
    addEventListener() {}
  };

  const bleDevice = {
    id,
    name,
    gatt: {
      connected: true,
      async connect() {
        this.connected = true;
        return {
          async getPrimaryService() {
            return {
              async getCharacteristic(uuid) {
                return uuid.includes('6e400002') ? txChar : rxChar;
              }
            };
          }
        };
      },
      disconnect() {
        this.connected = false;
      }
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },
    triggerDisconnectEvent() {
      this.gatt.connected = false;
      const set = listeners.get('gattserverdisconnected');
      if (set) {
        for (const fn of [...set]) fn();
      }
    },
    getListenerCount(type) {
      return listeners.has(type) ? listeners.get(type).size : 0;
    },
    writtenPackets,
    setWriteDelay(ms) { writeDelayMs = ms; }
  };

  return bleDevice;
}

test('1. CRC-8 & 20-byte BLE Packet Format Verification', () => {
  const { exports } = createSimulatedEnv();
  const { createPlayNotePacket, createStopSoundPacket, createSetLightsPacket, calculateCRC8 } = exports;

  // Test 440Hz, 250ms, inc=1
  const playPkt = createPlayNotePacket(440, 250, 1);
  assert.equal(playPkt.length, 20);
  assert.equal(playPkt[0], 5); // Sound device
  assert.equal(playPkt[1], 0); // PlayNote cmd
  assert.equal(playPkt[2], 1); // inc
  // 440 = 0x000001B8
  assert.deepEqual([...playPkt.slice(3, 7)], [0x00, 0x00, 0x01, 0xB8]);
  // 250 = 0x00FA
  assert.deepEqual([...playPkt.slice(7, 9)], [0x00, 0xFA]);
  assert.equal(playPkt[19], calculateCRC8(playPkt.subarray(0, 19)));

  const stopPkt = createStopSoundPacket(7);
  assert.equal(stopPkt.length, 20);
  assert.equal(stopPkt[0], 5);
  assert.equal(stopPkt[1], 1);
  assert.equal(stopPkt[2], 7);
  assert.equal(stopPkt[19], calculateCRC8(stopPkt.subarray(0, 19)));

  const ledPkt = createSetLightsPacket(3, 34, 197, 94, 12);
  assert.equal(ledPkt.length, 20);
  assert.equal(ledPkt[0], 3);
  assert.equal(ledPkt[1], 2);
  assert.equal(ledPkt[2], 12);
  assert.equal(ledPkt[3], 3);
  assert.deepEqual([...ledPkt.slice(4, 7)], [34, 197, 94]);
  assert.equal(ledPkt[19], calculateCRC8(ledPkt.subarray(0, 19)));
});

test('2. Monophonize & extractVoiceFromNotes: Repeated Same-Pitch Notes Preserved vs Sliced Sustained Note Merged', () => {
  const { exports } = createSimulatedEnv();
  const { monophonizeNotes, extractVoiceFromNotes } = exports;

  // Back-to-back repeated notes (gap = 0.000s, < 0.015s) of identical pitch (like Mario E5-E5-E5 in legato MIDI)
  const repeatedNotes = [
    { midi: 76, time: 0.0, duration: 0.2 },
    { midi: 76, time: 0.2, duration: 0.2 },
    { midi: 76, time: 0.4, duration: 0.2 }
  ];

  const monoRepeated = monophonizeNotes(repeatedNotes, 'highest', 0.85, 0);
  assert.equal(monoRepeated.length, 3, 'monophonizeNotes must NOT merge distinct repeated notes of the same pitch');

  const voiceRepeated = extractVoiceFromNotes(repeatedNotes, 0, 3, 0.85, 0);
  assert.equal(voiceRepeated.length, 3, 'extractVoiceFromNotes must NOT merge distinct repeated notes of the same pitch');

  // A single sustained melody note (0.0 -> 1.0s, MIDI 76) accompanied by two shorter lower notes (0.0->0.5, 0.5->1.0)
  // This slices the sustained note at t=0.5s, which SHOULD be merged back into 1 note for Voice 0 / highest!
  const sustainedWithAccomp = [
    { midi: 76, time: 0.0, duration: 1.0 }, // Single sustained top note
    { midi: 60, time: 0.0, duration: 0.5 },
    { midi: 64, time: 0.5, duration: 0.5 }
  ];

  const monoSustained = monophonizeNotes(sustainedWithAccomp, 'highest', 0.85, 0);
  assert.equal(monoSustained.length, 1, 'monophonizeNotes MUST merge slices belonging to the same sustained note');
  assert.ok(Math.abs(monoSustained[0].duration - 1.0) < 0.001);

  const voice0Sustained = extractVoiceFromNotes(sustainedWithAccomp, 0, 3, 0.85, 0);
  assert.equal(voice0Sustained.length, 1, 'extractVoiceFromNotes MUST merge slices belonging to the same sustained note');
  assert.ok(Math.abs(voice0Sustained[0].duration - 1.0) < 0.001);
});

test('3. Voice Extraction Fallback & Single-Track Ensemble Allocation (PC never silent on monophonic presets)', async () => {
  const { exports } = createSimulatedEnv();
  const { extractVoiceFromNotes, PRESETS, RootRobotDevice, app } = exports;

  // Voice 1 (middle voice) on monophonic Mario preset must NOT return 0 notes
  const v1Mario = extractVoiceFromNotes(PRESETS.mario.notes, 1, 3, 0.85, 0);
  assert.equal(v1Mario.length, PRESETS.mario.notes.length, 'Voice 1 fallback must return all notes on monophonic input');

  // Connect 1 Root robot while Mario preset (single-track monophonic) is loaded
  const ble1 = createFakeBleDevice('root-1', 'Root 1');
  const root1 = new RootRobotDevice(0, ble1);
  await root1.connect();
  app.rootDevices.push(root1);
  app.onDeviceListChanged();

  assert.ok(root1.sequence.length > 0, 'Root #1 must have notes');
  assert.ok(app.pcDevice.sequence.length > 0, 'PC Synth must NOT have 0 notes when 1 Root is connected on a preset');
  // Verify PC plays -12 semitone bass accompaniment on 1-track monophonic preset
  assert.equal(
    app.pcDevice.sequence[0].midi,
    root1.sequence[0].midi - 12,
    'PC Synth should play 1 octave lower (-12 semitones) bass accompaniment on monophonic single-track songs'
  );
});

test('4. Drum Track (Channel 10 / index 9) Filtering & Role Analysis Priority', async () => {
  const { exports } = createSimulatedEnv();
  const { RootRobotDevice, app } = exports;

  // Simulate multi-track MIDI where Track 0 is Channel 9 (Drums, high note count & avgPitch ~65) and Track 1 is Melody, Track 2 is Bass
  app.parsedTracks = [
    {
      index: 0,
      name: 'Standard Kit (Ch 10)',
      channel: 9,
      notes: Array.from({ length: 100 }, (_, i) => ({
        time: i * 0.2,
        duration: 0.1,
        midi: 64,
        name: 'E4',
        velocity: 0.9
      }))
    },
    {
      index: 1,
      name: 'Lead Synth (Ch 1)',
      channel: 0,
      notes: Array.from({ length: 50 }, (_, i) => ({
        time: i * 0.4,
        duration: 0.3,
        midi: 72,
        name: 'C5',
        velocity: 0.8
      }))
    },
    {
      index: 2,
      name: 'Acoustic Bass (Ch 2)',
      channel: 1,
      notes: Array.from({ length: 40 }, (_, i) => ({
        time: i * 0.5,
        duration: 0.4,
        midi: 40,
        name: 'E2',
        velocity: 0.8
      }))
    }
  ];

  const roles = app.analyzeTrackRoles();
  assert.equal(roles[0].role, 'percussion', 'Channel 9 track must be classified as percussion');
  assert.equal(roles[1].role, 'melody', 'Channel 0 track with avgPitch 72 and 50 notes must be melody');
  assert.equal(roles[2].role, 'bass', 'Channel 1 track with avgPitch 40 must be bass');

  const ble1 = createFakeBleDevice('root-1', 'Root 1');
  const root1 = new RootRobotDevice(0, ble1);
  await root1.connect();
  app.rootDevices = [root1];
  app.onDeviceListChanged();

  assert.equal(root1.autoResolvedTrackIndex, 1, 'Root #1 must be assigned Melody track (index 1), never Percussion');
  assert.equal(app.pcDevice.autoResolvedTrackIndex, 2, 'PC must be assigned Bass track (index 2), never Percussion');

  // Verify 'all' merged mode excludes drum track (channel 9)
  root1.assignedPart = 'all';
  app.recalculateEnsembleSequences();
  // Drum track had notes at 0.2s (MIDI 64); melody had notes at 0.0, 0.4 (MIDI 72); bass had 0.0, 0.5 (MIDI 40)
  const noteAt02 = root1.sequence.find(n => Math.abs(n.time - 0.2) < 0.01);
  assert.equal(noteAt02, undefined, 'Channel 9 drum notes must be excluded from allNotesMerged');
});

test('5. Low-Frequency Piezo Speaker Protection (foldSequenceForRootPiezo & triggerRootNote)', async () => {
  const { exports } = createSimulatedEnv();
  const { foldSequenceForRootPiezo, RootRobotDevice, app } = exports;

  const bassSeq = [
    { time: 0, duration: 0.5, playDuration: 0.4, durationMs: 400, midi: 36, name: 'C2', freq: 65.4, freqRounded: 65 },
    { time: 0.5, duration: 0.5, playDuration: 0.4, durationMs: 400, midi: 28, name: 'E1', freq: 41.2, freqRounded: 41 },
    { time: 1.0, duration: 0.5, playDuration: 0.4, durationMs: 400, midi: 60, name: 'C4', freq: 261.6, freqRounded: 262 }
  ];

  const folded = foldSequenceForRootPiezo(bassSeq, 48);
  assert.equal(folded[0].midi, 48, 'C2 (36) must fold up 1 octave to C3 (48)');
  assert.equal(folded[0].name, 'C3');
  assert.equal(folded[1].midi, 52, 'E1 (28) must fold up 2 octaves to E3 (52)');
  assert.equal(folded[1].name, 'E3');
  assert.equal(folded[2].midi, 60, 'C4 (60) >= 48 must remain unchanged');

  // Also test triggerRootNote direct frequency folding for rawFreq < 110Hz
  const ble = createFakeBleDevice('root-bass', 'Root Bass');
  const root = new RootRobotDevice(0, ble);
  await root.connect();
  ble.writtenPackets.length = 0;

  app.triggerRootNote(root, { freq: 55, playDuration: 0.2, name: 'A1', midi: 33 });
  await root.packetQueue;

  const playPkt = ble.writtenPackets.find(p => p[0] === 5 && p[1] === 0);
  assert.ok(playPkt, 'PlayNote packet should be sent');
  const sentFreq = ((playPkt[3] << 24) | (playPkt[4] << 16) | (playPkt[5] << 8) | playPkt[6]) >>> 0;
  assert.equal(sentFreq, 110, '55Hz should be octave-folded to 110Hz');
});

test('6. BLE Packet Queue Cancellation on stopSound() & LED Throttling', async () => {
  const env = createSimulatedEnv();
  const { RootRobotDevice, app } = env.exports;

  const ble = createFakeBleDevice('root-q', 'Root Q');
  const root = new RootRobotDevice(0, ble);
  await root.connect();
  ble.writtenPackets.length = 0;
  ble.setWriteDelay(25);

  // Queue 5 rapid notes and immediately call stopSound()
  root.playNote(440, 200);
  root.playNote(494, 200);
  root.playNote(523, 200);
  root.playNote(587, 200);
  root.playNote(659, 200);
  await root.stopSound();

  // At most the first in-flight PlayNote could have started before clearQueue(), followed by StopSound;
  // all remaining queued PlayNotes must have been cancelled!
  const playNotesSent = ble.writtenPackets.filter(p => p[0] === 5 && p[1] === 0);
  const stopSoundsSent = ble.writtenPackets.filter(p => p[0] === 5 && p[1] === 1);
  assert.ok(playNotesSent.length <= 1, `Expected <= 1 PlayNote sent after stopSound(), got ${playNotesSent.length}`);
  assert.equal(stopSoundsSent.length, 1, 'StopSound packet must be sent even after clearQueue()');

  // Test LED throttling & deduplication
  ble.setWriteDelay(0);
  ble.writtenPackets.length = 0;
  env.setNow(5000);
  await root.setLights(1, 34, 197, 94, { throttleMs: 200 });
  env.advanceTime(50); // Only 50ms elapsed (< 200ms) and identical color
  await root.setLights(1, 34, 197, 94, { throttleMs: 200 });
  await root.setLights(1, 6, 182, 212, { throttleMs: 200 }); // Different color, still within 200ms throttle window

  const ledPackets = ble.writtenPackets.filter(p => p[0] === 3 && p[1] === 2);
  assert.equal(ledPackets.length, 1, 'LED packets within throttleMs window or duplicate state must be skipped');
});

test('7. Unexpected BLE Disconnection Cleanup, Slot Re-indexing, and Re-pairing', async () => {
  const { exports } = createSimulatedEnv();
  const { RootRobotDevice, DEVICE_THEMES, app } = exports;

  const ble1 = createFakeBleDevice('id-1', 'Root 1');
  const ble2 = createFakeBleDevice('id-2', 'Root 2');
  const r1 = new RootRobotDevice(0, ble1);
  const r2 = new RootRobotDevice(1, ble2);
  await r1.connect();
  await r2.connect();
  app.rootDevices.push(r1, r2);
  app.onDeviceListChanged();

  assert.equal(app.rootDevices.length, 2);
  assert.equal(ble1.getListenerCount('gattserverdisconnected'), 1, 'Should register exactly 1 disconnect listener');

  // Simulate unexpected BLE disconnect of Root 1
  ble1.triggerDisconnectEvent();

  assert.equal(app.rootDevices.length, 1, 'Disconnected Root 1 must be removed from app.rootDevices');
  assert.equal(app.rootDevices[0].device.id, 'id-2');
  assert.equal(app.rootDevices[0].slotIndex, 0, 'Remaining Root 2 must be re-indexed to slotIndex 0');
  assert.equal(app.rootDevices[0].theme.id, DEVICE_THEMES[0].id, 'Remaining Root 2 must adopt slot 0 theme');

  // Re-connect r1 and ensure listener isn't duplicated
  await r1.connect();
  assert.equal(ble1.getListenerCount('gattserverdisconnected'), 1, 'Reconnecting must not stack duplicate listeners');
});

test('8. Playback Engine: Mid-Playback Speed Change, Loop Reset, Background Tab Timer, and LocalSynth Cleanup', () => {
  const env = createSimulatedEnv();
  const { app } = env.exports;
  const { document, elements, createdAudioNodes } = env;

  app.loadPreset('mario');
  env.setNow(1000);
  app.play();
  assert.equal(app.isPlaying, true);

  // Advance 2000ms at 1.0x -> currentPlayTime = 2.0s
  env.setNow(3000);
  env.flushOneRaf();
  assert.ok(Math.abs(app.currentPlayTime - 2.0) < 0.01, `Expected ~2.0s, got ${app.currentPlayTime}`);

  // Change speed to 2.0x while playing
  const speedSelect = elements.get('speedSelect');
  speedSelect.value = '2.0';
  speedSelect.dispatchEvent('change');
  assert.equal(app.speed, 2.0);

  // On the very next tick (10ms later), currentPlayTime should be ~2.02s, NOT jump to 4.0s!
  env.setNow(3010);
  env.flushOneRaf();
  assert.ok(Math.abs(app.currentPlayTime - 2.02) < 0.02, `Expected ~2.02s after speed change, got ${app.currentPlayTime}`);

  // Test mid-playback transpose change preserves playback state and position
  app.setTranspose(2);
  assert.equal(app.isPlaying, true, 'Changing transpose during playback must NOT stop playback');
  assert.ok(Math.abs(app.currentPlayTime - 2.02) < 0.02, 'Changing transpose during playback must preserve currentPlayTime');

  // Test loop reset at end of song
  app.isLooping = true;
  env.setNow(3010 + (app.totalDuration * 1000));
  env.flushOneRaf();
  assert.equal(app.isPlaying, true, 'Looping playback must remain playing at song end');
  assert.equal(app.currentPlayTime, 0, 'Looping playback must seek back to 0 cleanly');
  assert.ok(env.rafQueue.size === 1, 'Looping branch must schedule exactly 1 next tick');

  // Test background tab visibilitychange switches to setTimeout
  document.hidden = true;
  document.dispatchEvent('visibilitychange');
  assert.equal(app.animFrameId, null, 'RAF should be cleared when tab is hidden');
  assert.ok(app.bgTimerId !== null, 'Background setTimeout timer should be active when document.hidden is true');

  app.stop();
  assert.equal(app.bgTimerId, null, 'stop() must clear background timer');

  // Test LocalSynth osc.onended cleanup
  assert.ok(createdAudioNodes.length > 0, 'Audio oscillators should have been created');
  const lastOsc = createdAudioNodes[createdAudioNodes.length - 1];
  assert.equal(typeof lastOsc.onended, 'function', 'osc.onended handler must be attached');
  lastOsc.onended();
  assert.equal(lastOsc.disconnected, true, 'osc.onended must disconnect oscillator node');
});

test('9. DOM & Canvas Rendering Optimizations (Offscreen Blit, Legend Decoupling, Card Label Caching & Rest Reset)', async () => {
  const env = createSimulatedEnv();
  const { RootRobotDevice, app } = env.exports;
  const { elements } = env;

  const ble1 = createFakeBleDevice('id-opt', 'Root Opt');
  const root1 = new RootRobotDevice(0, ble1);
  await root1.connect();
  app.rootDevices.push(root1);
  app.onDeviceListChanged();

  assert.ok(root1.cardLabelEl, 'RootRobotDevice must cache cardLabelEl on card render');
  assert.ok(app.bgBrightCanvas && app.bgDimCanvas, 'Offscreen bright & dim piano roll canvases must be built');

  // Verify drawPianoRoll uses drawImage blitting instead of rebuilding legend or thousands of roundRects
  const mainCtx = app.ctx;
  mainCtx.calls.length = 0;
  app.currentPlayTime = 0.05; // Inside first Mario note (0.0 -> 0.15)
  app.updateActiveNoteBadges();
  app.drawPianoRoll();

  const drawImageCalls = mainCtx.calls.filter(c => c[0] === 'drawImage');
  assert.ok(drawImageCalls.length >= 1, 'drawPianoRoll must blit from offscreen cached canvas via drawImage');
  assert.equal(elements.get('activeNoteName').textContent, 'E5', 'Active note name should be E5 at t=0.05s');

  // Move to rest between Mario note 0 (0.0..0.15) and note 1 (0.20..0.35): t = 0.175s
  app.currentPlayTime = 0.175;
  app.updateActiveNoteBadges();
  assert.equal(elements.get('activeNoteName').textContent, '---', 'Active note badge must reset to --- during rests');
  assert.equal(root1.cardLabelEl.textContent, '待機中', 'Device card label must reset to 待機中 during rests');
});

