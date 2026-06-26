import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Utilitários puros extraídos do recorder.js para teste isolado
// (sem dependência de browser/canvas/VideoEncoder)
// ──────────────────────────────────────────────────────────────────────────────

const sanitizeFilename = (name) =>
  name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .replace(/-+/g, '-')
    .toLowerCase();

/** Calcula o timestamp em microssegundos dado o índice do frame a 30fps */
const frameTimestamp = (index) => index * Math.round(1_000_000 / 30);

/** Duração de cada frame em microssegundos a 30fps */
const FRAME_DURATION = Math.round(1_000_000 / 30); // ≈ 33333 μs

/** Determina se o frame no índice dado deve ser um keyframe */
const isKeyFrame = (index) => index === 0 || index % 60 === 0;

// ──────────────────────────────────────────────────────────────────────────────

describe('Recorder - sanitizeFilename', () => {
  it('converte espaços em hifens', () => {
    expect(sanitizeFilename('São Paulo')).toBe('sao-paulo');
  });

  it('remove acentos', () => {
    expect(sanitizeFilename('Florianópolis')).toBe('florianopolis');
    expect(sanitizeFilename('Cuiabá')).toBe('cuiaba');
  });

  it('remove caracteres especiais', () => {
    expect(sanitizeFilename('Rota #1 (teste)')).toBe('rota-1-teste');
  });

  it('colapsa múltiplos hifens', () => {
    expect(sanitizeFilename('São  Paulo---SC')).toBe('sao-paulo-sc');
  });

  it('converte para minúsculas', () => {
    expect(sanitizeFilename('JOINVILLE')).toBe('joinville');
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('Recorder - timestamps de frames a 30fps', () => {
  it('frame 0 tem timestamp 0 μs', () => {
    expect(frameTimestamp(0)).toBe(0);
  });

  it('frame 1 tem timestamp ~33333 μs', () => {
    expect(frameTimestamp(1)).toBe(FRAME_DURATION);
  });

  it('frame 30 tem timestamp ~1 segundo (1 000 000 μs)', () => {
    expect(frameTimestamp(30)).toBe(30 * FRAME_DURATION);
    expect(frameTimestamp(30)).toBeGreaterThanOrEqual(999_990);
    expect(frameTimestamp(30)).toBeLessThanOrEqual(1_000_010);
  });

  it('a duração de cada frame é positiva', () => {
    expect(FRAME_DURATION).toBeGreaterThan(0);
  });

  it('timestamps são monotonicamente crescentes', () => {
    const timestamps = [0, 1, 2, 3, 10, 100].map(frameTimestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });
});

describe('Recorder - lógica de keyframe', () => {
  it('frame 0 SEMPRE é keyframe', () => {
    expect(isKeyFrame(0)).toBe(true);
  });

  it('frame 60 é keyframe (intervalo de 60 frames = 2s a 30fps)', () => {
    expect(isKeyFrame(60)).toBe(true);
  });

  it('frame 120 é keyframe', () => {
    expect(isKeyFrame(120)).toBe(true);
  });

  it('frames intermediários NÃO são keyframes', () => {
    [1, 2, 29, 30, 31, 59, 61, 90, 119].forEach(idx => {
      expect(isKeyFrame(idx)).toBe(false);
    });
  });
});

describe('Recorder - construção do nome do arquivo', () => {
  it('gera nome correto para cidade de origem e destino', () => {
    const start = sanitizeFilename('São Paulo') || 'inicio';
    const end = sanitizeFilename('Curitiba') || 'fim';
    expect(`rota-${start}-para-${end}.mp4`).toBe('rota-sao-paulo-para-curitiba.mp4');
  });

  it('usa fallback quando cidade está vazia', () => {
    const start = sanitizeFilename('') || 'inicio';
    const end = sanitizeFilename('') || 'fim';
    expect(`rota-${start}-para-${end}.mp4`).toBe('rota-inicio-para-fim.mp4');
  });
});
