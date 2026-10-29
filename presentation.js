// Reusable presentation presets shared by the story engine and browser renderer.
// Stable IDs are intentionally decoupled from asset file names so future chapters
// can reuse these commands without changing engine code.
export const CAMERA_PRESETS = Object.freeze({
  normal: { zoom: 1, x: 0, y: 0 },
  medium: { zoom: 1.04, x: 0, y: 12 },
  close: { zoom: 1.08, x: 0, y: 18 },
  dramatic: { zoom: 1.12, x: 0, y: 28 },
  horror: { zoom: 1.1, x: 0, y: 18 },
});

export const CAMERA_PANS = Object.freeze({ left: 65, right: -65, center: 0 });
export const CAMERA_SHAKES = Object.freeze({ small: 260, medium: 380, big: 520 });

export const ANIMATION_PRESETS = Object.freeze({
  enter_left: { duration: 420 },
  enter_right: { duration: 420 },
  exit_left: { duration: 360 },
  exit_right: { duration: 360 },
  small_shake: { duration: 320 },
  big_shake: { duration: 480 },
  surprise_jump: { duration: 380 },
  recoil: { duration: 360 },
  lean_forward: { duration: 420 },
  step_forward: { duration: 420 },
  step_back: { duration: 420 },
  sad_drop: { duration: 520 },
});

export const BACKGROUND_EFFECT_PRESETS = Object.freeze(new Set([
  'forest_wind', 'forest_fog', 'rain_light', 'rain_heavy', 'dust',
  'electric_blue', 'dark_vignette', 'mirror_distortion', 'cafe_warm'
]));

export const AMBIENCE_PRESETS = Object.freeze({
  forest_day: { effects: ['forest_wind', 'birds'], interval: 6200 },
  forest_tension: { effects: ['forest_wind'], interval: 3400 },
  road_night: { effects: ['forest_wind'], interval: 4300 },
});

export const EXPRESSION_FALLBACKS = Object.freeze({
  pacifica: {
    neutral: 'idle', smile: 'smile', smug: 'smile_aggressive', annoyed: 'annoyed',
    angry: 'angry', surprised: 'surprised', scared: 'scared', suspicious: 'curious',
    sad: 'upset', embarrassed: 'embarrassed', determined: 'fighting',
  },
  gideon: {
    neutral: 'idle', deadpan: 'idle', mild_smile: 'smile', annoyed: 'annoyed',
    suspicious: 'idle', surprised: 'surprised', scared: 'scared', uncomfortable: 'nervous',
    embarrassed: 'embarrassed', sad: 'upset', angry: 'angry',
  },
});

export function defaultPresentationState() {
  return {
    camera: { ...CAMERA_PRESETS.normal, focus: null, duration: 0, easing: 'ease' },
    backgroundEffect: null,
    ambience: null,
    ambienceFade: 0,
    choiceImportance: 'normal',
  };
}

export function normalizePresentationState(value) {
  const base = defaultPresentationState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const camera = value.camera && typeof value.camera === 'object' ? value.camera : {};
  return {
    ...base,
    ...value,
    camera: {
      ...base.camera,
      ...camera,
      zoom: finite(camera.zoom, base.camera.zoom, .75, 1.5),
      x: finite(camera.x, base.camera.x, -120, 120),
      y: finite(camera.y, base.camera.y, -700, 700),
      duration: finite(camera.duration, 0, 0, 8),
      focus: typeof camera.focus === 'string' && camera.focus ? camera.focus.toLowerCase() : null,
    },
    backgroundEffect: BACKGROUND_EFFECT_PRESETS.has(value.backgroundEffect) ? value.backgroundEffect : null,
    ambience: typeof value.ambience === 'string' && value.ambience ? value.ambience : null,
    ambienceFade: finite(value.ambienceFade, 0, 0, 8),
    choiceImportance: ['minor', 'normal', 'important'].includes(value.choiceImportance) ? value.choiceImportance : 'normal',
  };
}

export function finite(value, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function optionNumber(args, key, fallback = 0) {
  const words = args.map(value => String(value).toLowerCase());
  const index = words.indexOf(String(key).toLowerCase());
  return index >= 0 ? finite(args[index + 1], fallback) : fallback;
}
