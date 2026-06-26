// Módulo de Gravação e Composição do Canvas de Vídeo
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getCityName, getCurrentRouteDetails, calculateTotalTravelTime } from '../utils/helpers.js';

// Tenta encontrar um codec H.264 suportado pelo VideoEncoder
async function findSupportedH264Codec(width, height) {
  const candidates = [
    'avc1.640034', // High Profile Level 5.2
    'avc1.64002a', // High Profile Level 4.2
    'avc1.4d0034', // Main Profile Level 5.2
    'avc1.42E034', // Baseline Level 5.2
    'avc1.42001f', // Baseline Level 3.1
  ];
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec, width, height, bitrate: 10_000_000, framerate: 30,
      });
      if (supported) return codec;
    } catch { /* continua */ }
  }
  return null;
}

export async function startVideoRecording(state, updateVehiclePreviewMarker, animateFrame) {
  try {
    if (state.interpolatedPath.length === 0) {
      alert('Calcule a rota antes de gravar o vídeo.');
      return;
    }

    state.recordedChunks = [];
    state.isRecording = true;
    state.isMP4Mode = false;
    state.recordingFrameIndex = 0;

    const recStatus = document.getElementById('recording-status');
    recStatus.classList.remove('hidden');
    document.getElementById('recording-progress').style.width = '0%';

    const hiddenCanvas = document.getElementById('hidden-recording-canvas');
    let width, height;

    if (state.videoFormat === 'vertical') {
      width = 1080; height = 1920;
    } else if (state.videoFormat === 'horizontal') {
      width = 1920; height = 1080;
    } else {
      width = 1080; height = 1080;
    }

    hiddenCanvas.width = width;
    hiddenCanvas.height = height;
    hiddenCanvas.classList.remove('hidden');

    const previewCompass = document.getElementById('preview-compass');
    if (previewCompass) previewCompass.classList.add('hidden');

    // ---- Tenta gravar em MP4 via WebCodecs API (VideoEncoder + mp4-muxer) ----
    if (typeof VideoEncoder !== 'undefined') {
      try {
        const codec = await findSupportedH264Codec(width, height);
        if (codec) {
          const FRAME_DURATION_MICROS = Math.round(1_000_000 / 30); // ~33333 μs a 30fps
          state.frameDurationMicros = FRAME_DURATION_MICROS;

          const target = new ArrayBufferTarget();
          const muxer = new Muxer({
            target,
            video: { codec: 'avc', width, height },
            fastStart: 'in-memory',
            // Faz o muxer compensar automaticamente o DTS não-zero do encoder
            // (timestamps relativos ao documento, não ao início da gravação)
            firstTimestampBehavior: 'offset',
          });

          const encoder = new VideoEncoder({
            output: (chunk, meta) => {
              try {
                // Usa addVideoChunkRaw para garantir uma duration válida
                // mesmo quando EncodedVideoChunk.duration é null (alguns browsers)
                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                const duration = (chunk.duration != null && chunk.duration > 0)
                  ? chunk.duration
                  : FRAME_DURATION_MICROS;
                muxer.addVideoChunkRaw(
                  data, chunk.type, chunk.timestamp, duration, meta ?? undefined
                );
              } catch (e) {
                console.warn('addVideoChunk error:', e.message);
              }
            },
            error: (e) => console.error('VideoEncoder error:', e),
          });

          encoder.configure({
            codec,
            width,
            height,
            bitrate: 12_000_000, // 12 Mbps — alta qualidade
            framerate: 30,
            latencyMode: 'quality',
          });

          state.videoEncoder = encoder;
          state.muxer = muxer;
          state.muxerTarget = target;
          state.isMP4Mode = true;
          console.log(`Gravando em MP4/H.264 (${codec}) @ 12 Mbps`);
        }
      } catch (e) {
        console.warn('VideoEncoder falhou, usando fallback WebM:', e);
      }
    }

    // ---- Fallback: MediaRecorder (WebM) com bitrate alto ----
    if (!state.isMP4Mode) {
      const stream = hiddenCanvas.captureStream(30);
      let options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 10_000_000 };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 10_000_000 };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm', videoBitsPerSecond: 10_000_000 };
      }

      state.mediaRecorder = new MediaRecorder(stream, options);
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) state.recordedChunks.push(e.data);
      };
      state.mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e.error || e);
        alert('Erro na gravação: ' + (e.error ? e.error.message : 'codec não suportado'));
      };
      state.mediaRecorder.onstop = () => saveVideoFile(state);
      state.mediaRecorder.start();
      console.log('Gravando em WebM via MediaRecorder @ 10 Mbps');
    }

    state.isAnimating = true;
    state.animationStartTime = performance.now();
    state.currentCameraBearing = 0;

    updateVehiclePreviewMarker();
    if (state.previewMarker) {
      state.previewMarker.getElement().style.display = 'none';
    }
    animateFrame();
  } catch (err) {
    console.error('Error starting video recording:', err);
    alert('Erro ao iniciar a gravação do vídeo: ' + err.message);
    state.isRecording = false;
    const recStatus = document.getElementById('recording-status');
    if (recStatus) recStatus.classList.add('hidden');
  }
}

// Captura o frame atual do canvas e envia ao encoder (só no modo MP4)
export function captureRecordingFrame(state) {
  if (!state.isRecording || !state.isMP4Mode || !state.videoEncoder) return;
  if (state.videoEncoder.state !== 'configured') return;

  const canvas = document.getElementById('hidden-recording-canvas');
  const FRAME_DURATION = Math.round(1_000_000 / 30); // microssegundos por frame a 30fps
  const timestampMicros = state.recordingFrameIndex * FRAME_DURATION;
  try {
    const frame = new VideoFrame(canvas, {
      timestamp: timestampMicros,
      duration: FRAME_DURATION,  // obrigatório para mp4-muxer calcular timestamps
    });
    // Primeiro frame DEVE ser keyframe para que o decoderConfig seja gerado
    const keyFrame = state.recordingFrameIndex === 0 || state.recordingFrameIndex % 60 === 0;
    state.videoEncoder.encode(frame, { keyFrame });
    frame.close();
    state.recordingFrameIndex++;
  } catch (e) {
    console.error('captureRecordingFrame error:', e);
  }
}

export async function stopVideoRecording(state) {
  try {
    if (state.isMP4Mode && state.videoEncoder) {
      // Flush todos os frames pendentes e finaliza o muxer
      await state.videoEncoder.flush();
      state.muxer.finalize();
      const buffer = state.muxerTarget.buffer;
      state.videoEncoder.close();
      state.videoEncoder = null;
      state.muxer = null;
      state.muxerTarget = null;
      state.isMP4Mode = false;
      saveMP4File(state, buffer);
    } else if (state.mediaRecorder) {
      if (state.mediaRecorder.state === 'recording' || state.mediaRecorder.state === 'paused') {
        state.mediaRecorder.stop();
      } else {
        saveVideoFile(state);
      }
    } else {
      state.isRecording = false;
      const recStatus = document.getElementById('recording-status');
      if (recStatus) recStatus.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error stopping recording:', err);
    alert('Erro ao parar a gravação: ' + err.message);
    state.isRecording = false;
    const recStatus = document.getElementById('recording-status');
    if (recStatus) recStatus.classList.add('hidden');
  }
}

const sanitizeFilename = (name) =>
  name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .replace(/-+/g, '-')
    .toLowerCase();

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style = 'display: none';
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 10000);
}

function saveMP4File(state, buffer) {
  state.isRecording = false;
  state.isPreviewMode = false;
  const recStatus = document.getElementById('recording-status');
  if (recStatus) recStatus.classList.add('hidden');

  const blob = new Blob([buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const startCity = sanitizeFilename(getCityName(state.stops[0].value)) || 'inicio';
  const endCity = sanitizeFilename(getCityName(state.stops[state.stops.length - 1].value)) || 'fim';
  triggerDownload(url, `rota-${startCity}-para-${endCity}.mp4`);
  alert('Seu vídeo de viagem animada foi gerado e baixado com sucesso! (.mp4)');
}

export function saveVideoFile(state) {
  try {
    state.isRecording = false;
    state.isPreviewMode = false;
    const recStatus = document.getElementById('recording-status');
    if (recStatus) recStatus.classList.add('hidden');

    if (!state.recordedChunks || state.recordedChunks.length === 0) {
      alert('Nenhum fragmento de vídeo foi gravado. A gravação falhou.');
      return;
    }

    const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const startCity = sanitizeFilename(getCityName(state.stops[0].value)) || 'inicio';
    const endCity = sanitizeFilename(getCityName(state.stops[state.stops.length - 1].value)) || 'fim';
    triggerDownload(url, `rota-${startCity}-para-${endCity}.webm`);
    alert('Seu vídeo de viagem animada foi gerado e baixado com sucesso! (.webm)');
  } catch (err) {
    console.error('Error saving video file:', err);
    alert('Erro ao salvar o arquivo de vídeo: ' + err.message);
  }
}


export function drawRecordingFrame(state, currentCoords, bearing, progress, isIntro, activePhotos, activePhotoCity, isSummary) {
  try {
    const mapCanvas = state.map.getCanvas();
    const recordingCanvas = document.getElementById('hidden-recording-canvas');
    const ctx = recordingCanvas.getContext('2d');

    const w = recordingCanvas.width;
    const h = recordingCanvas.height;

    // 1. Desenha o mapa base
    ctx.drawImage(mapCanvas, 0, 0, w, h);

    const scaleX = w / mapCanvas.width;
    const scaleY = h / mapCanvas.height;

    // 2. Se for tela final de resumo, desenha a tela de resumo e ignora pins/HUD normal
    if (isSummary) {
      drawSummaryScreen(state, ctx, w, h);
      return;
    }

    // 3. Desenha pins
    state.stops.forEach((stop, stopIdx) => {
      const isPinOnMap = state.placedPinStopIds.includes(stop.id);
      if (stop.coords && isPinOnMap) {
        const pinScreenPos = state.map.project(stop.coords);
        const px = pinScreenPos.x * scaleX;
        const py = pinScreenPos.y * scaleY;

        const pinType = stopIdx === 0 ? 'start' : stopIdx === state.stops.length - 1 ? 'end' : 'stop-point';
        drawPinOnCanvas(ctx, px, py, pinType, w / 1080, state.routeColor);
      }
    });

    // 4. Desenha o veículo/avatar
    if (!isIntro) {
      const screenPos = state.map.project(currentCoords);
      const vehX = screenPos.x * scaleX;
      const vehY = screenPos.y * scaleY;

      let avatarImg = state.avatarImages[state.avatarType];
      if (state.avatarType === 'custom' && state.customAvatarImage) {
        avatarImg = state.customAvatarImage;
      }

      if (avatarImg) {
        ctx.save();
        ctx.translate(vehX, vehY);
        ctx.rotate(0); // Fixo de frente/horizontal no canvas

        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;

        const size = state.avatarSize * (w / 720);
        ctx.drawImage(avatarImg, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }

    // 5. Polaroid de Fotos no Vídeo Gravado (Stack de até 4 Polaroids sobrepostas)
    if (activePhotos && activePhotos.length > 0) {
      const cardScale = w / 1080;
      const count = activePhotos.length;

      let leftPercentages = [50];
      if (count === 2) leftPercentages = [33, 67];
      else if (count === 3) leftPercentages = [20, 50, 80];
      else if (count === 4) leftPercentages = [15, 38, 62, 85];

      activePhotos.forEach((photo, idx) => {
        ctx.save();

        const cardW = 290 * cardScale;
        const cardH = 370 * cardScale;

        const rotations = [-7, 3, -4, 6];
        const rot = rotations[idx % rotations.length];
        const leftPct = leftPercentages[idx] || 50;
        const yOffset = (idx % 2 === 0 ? -12 : 12) * cardScale;

        const cardX = w * (leftPct / 100) - cardW / 2;
        const cardY = h * 0.62 + yOffset; // Below midpoint to avoid covering the avatar

        ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
        ctx.rotate(rot * Math.PI / 180);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 24 * cardScale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 12 * cardScale;

        ctx.fillStyle = '#ffffff';
        roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 8 * cardScale, true, false);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        const padding = 18 * cardScale;
        const imgSize = cardW - padding * 2;
        const imgX = -cardW / 2 + padding;
        const imgY = -cardH / 2 + padding;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(imgX, imgY, imgSize, imgSize);

        const imgObj = photo.img;
        if (imgObj && imgObj.complete && imgObj.width > 0) {
          let sx, sy, sWidth, sHeight;
          const imgAspect = imgObj.width / imgObj.height;
          if (imgAspect > 1) {
            sHeight = imgObj.height;
            sWidth = imgObj.height;
            sx = (imgObj.width - sWidth) / 2;
            sy = 0;
          } else {
            sWidth = imgObj.width;
            sHeight = imgObj.width;
            sx = 0;
            sy = (imgObj.height - sHeight) / 2;
          }
          ctx.drawImage(imgObj, sx, sy, sWidth, sHeight, imgX, imgY, imgSize, imgSize);
        }

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5 * cardScale;
        ctx.strokeRect(imgX, imgY, imgSize, imgSize);

        if (activePhotoCity) {
          ctx.fillStyle = '#1e293b';
          ctx.font = `bold ${Math.round(24 * cardScale)}px Outfit`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(activePhotoCity, 0, -cardH / 2 + padding + imgSize + 12 * cardScale);
        }

        ctx.restore();
      });
    }

    // 6. HUD de Informações
    if (state.showOverlayInfo) {
      drawHUD(state, ctx, w, h, progress, isIntro, bearing);
    }
  } catch (error) {
    console.error("Error drawing recording frame:", error);
  }
}

function drawPinOnCanvas(ctx, x, y, type, scale, routeColor) {
  ctx.save();
  ctx.beginPath();

  const radius = 8 * scale;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetY = 2 * scale;

  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.lineWidth = 3 * scale;
  if (type === 'start') {
    ctx.strokeStyle = routeColor;
  } else if (type === 'end') {
    ctx.strokeStyle = '#10b981';
  } else {
    ctx.strokeStyle = '#f59e0b';
  }
  ctx.stroke();
  ctx.restore();
}

function drawHUD(state, ctx, w, h, progress, isIntro, travelBearing) {
  const scale = w / 1080;

  const headerGrad = ctx.createLinearGradient(0, 0, 0, 220 * scale);
  headerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
  headerGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
  headerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, w, 220 * scale);

  const footerGrad = ctx.createLinearGradient(0, h - 200 * scale, 0, h);
  footerGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  footerGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
  footerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
  ctx.fillStyle = footerGrad;
  ctx.fillRect(0, h - 200 * scale, w, 200 * scale);

  const startCity = getCityName(state.stops[0].value);
  const endCity = getCityName(state.stops[state.stops.length - 1].value);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(52 * scale)}px Outfit`;
  ctx.textAlign = 'center';
  ctx.fillText(`${startCity} ➔ ${endCity}`, w / 2, 80 * scale);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.round(28 * scale)}px 'Plus Jakarta Sans'`;
  ctx.fillText(state.videoTitle || 'Minha Viagem dos Sonhos', w / 2, 130 * scale);

  const boxW = 560 * scale;
  const boxH = 135 * scale;
  const boxX = (w - boxW) / 2;
  const boxY = h - 215 * scale;

  ctx.fillStyle = 'rgba(15, 17, 21, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2.5 * scale;
  roundRect(ctx, boxX, boxY, boxW, boxH, 16 * scale, true, true);

  if (isIntro) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(24 * scale)}px Outfit`;
    ctx.textAlign = 'center';
    ctx.fillText('PREPARANDO PARTIDA...', w / 2, boxY + 54 * scale);

    ctx.fillStyle = '#9ca3af';
    ctx.font = `${Math.round(20 * scale)}px 'Plus Jakarta Sans'`;
    ctx.fillText(`Partida: ${startCity}`, w / 2, boxY + 92 * scale);
  } else {
    const stopDetails = getCurrentRouteDetails(state.stops, progress);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(20 * scale)}px Outfit`;
    ctx.textAlign = 'left';
    ctx.fillText('PARADA ATUAL:', boxX + 28 * scale, boxY + 46 * scale);

    ctx.fillStyle = state.routeColor;
    ctx.font = `bold ${Math.round(28 * scale)}px Outfit`;
    ctx.fillText(stopDetails.city, boxX + 28 * scale, boxY + 90 * scale);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(18 * scale)}px 'Plus Jakarta Sans'`;
    ctx.textAlign = 'right';
    ctx.fillText(stopDetails.date, boxX + boxW - 28 * scale, boxY + 48 * scale);

    ctx.fillStyle = '#9ca3af';
    ctx.font = `${Math.round(18 * scale)}px 'Plus Jakarta Sans'`;
    ctx.fillText(stopDetails.time, boxX + boxW - 28 * scale, boxY + 90 * scale);
  }

  // Calcula kilometragem atual
  let currentKm = 0;
  if (!isIntro && state.cumulativeDistances && state.cumulativeDistances.length > 0) {
    const pathIdx = Math.min(
      Math.floor(progress * (state.cumulativeDistances.length - 1)),
      state.cumulativeDistances.length - 1
    );
    currentKm = state.cumulativeDistances[pathIdx] || 0;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, 40 * scale, h - 50 * scale, w - 80 * scale, 10 * scale, 5 * scale, true, false);

  ctx.fillStyle = state.routeColor;
  roundRect(ctx, 40 * scale, h - 50 * scale, (w - 80 * scale) * progress, 10 * scale, 5 * scale, true, false);

  if (!isIntro && currentKm > 0) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(22 * scale)}px Outfit`;
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(currentKm)} km`, 40 * scale, h - 70 * scale);
    ctx.restore();
  }
  // Bússola
  const checkCompass = document.getElementById('check-show-compass');
  const shouldShowCompass = checkCompass ? checkCompass.checked : true;

  if (shouldShowCompass) {
    const compR = 30 * scale;
    const compX = w - compR - 40 * scale;
    const compY = h - compR - 80 * scale;

    ctx.save();
    ctx.translate(compX, compY);

    ctx.beginPath();
    ctx.arc(0, 0, compR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22, 26, 34, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2 * scale;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `800 ${Math.round(10 * scale)}px Outfit`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = state.routeColor;
    ctx.fillText('N', 0, -compR + 8 * scale);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('S', 0, compR - 8 * scale);
    ctx.fillText('L', compR - 8 * scale, 0);
    ctx.fillText('O', -compR + 8 * scale, 0);

    ctx.rotate(travelBearing * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(0, -compR + 12 * scale);
    ctx.lineTo(3 * scale, 0);
    ctx.lineTo(-3 * scale, 0);
    ctx.fillStyle = state.routeColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, compR - 12 * scale);
    ctx.lineTo(3 * scale, 0);
    ctx.lineTo(-3 * scale, 0);
    ctx.fillStyle = '#6b7280';
    ctx.fill();

    ctx.restore();
  }
}

export function drawSummaryScreen(state, ctx, w, h) {
  try {
    const scale = w / 1080;

    // 1. Fundo translúcido para deixar o trajeto/mapa visível
    ctx.fillStyle = 'rgba(15, 17, 21, 0.4)';
    ctx.fillRect(0, 0, w, h);

    // 2. Título do Vídeo no Topo
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(52 * scale)}px Outfit`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 10 * scale;
    ctx.shadowOffsetY = 2 * scale;
    ctx.fillText(state.videoTitle || 'Minha Viagem dos Sonhos', w / 2, 120 * scale);

    // 3. Subtítulo com tempo total e kilometragem calculados
    const totalTimeStr = calculateTotalTravelTime(state.stops);
    const totalDist = state.cumulativeDistances.length > 0 ? state.cumulativeDistances[state.cumulativeDistances.length - 1] : 0;
    const distStr = totalDist > 0 ? `${Math.round(totalDist)} km` : '';

    let statsY = 200 * scale;
    if (totalTimeStr && distStr) {
      ctx.fillStyle = state.routeColor;
      ctx.font = `bold ${Math.round(30 * scale)}px Outfit`;
      ctx.fillText(`${totalTimeStr}   •   ${distStr}`, w / 2, statsY);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `${Math.round(18 * scale)}px 'Plus Jakarta Sans'`;
      ctx.fillText('TEMPO DE VIAGEM   •   DISTÂNCIA TOTAL', w / 2, statsY + 45 * scale);
    } else if (totalTimeStr) {
      ctx.fillStyle = state.routeColor;
      ctx.font = `bold ${Math.round(30 * scale)}px Outfit`;
      ctx.fillText(totalTimeStr, w / 2, statsY);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `${Math.round(18 * scale)}px 'Plus Jakarta Sans'`;
      ctx.fillText('TEMPO TOTAL DE VIAGEM', w / 2, statsY + 45 * scale);
    } else if (distStr) {
      ctx.fillStyle = state.routeColor;
      ctx.font = `bold ${Math.round(30 * scale)}px Outfit`;
      ctx.fillText(distStr, w / 2, statsY);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `${Math.round(18 * scale)}px 'Plus Jakarta Sans'`;
      ctx.fillText('DISTÂNCIA TOTAL DE VIAGEM', w / 2, statsY + 45 * scale);
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 4. Colagem das fotos no rodapé
    const allPhotos = [];
    state.stops.forEach(stop => {
      if (stop.photos) {
        stop.photos.forEach(photo => allPhotos.push(photo));
      }
    });

    if (allPhotos.length > 0) {
      const photosToShow = allPhotos.slice(0, 6);
      const count = photosToShow.length;

      const thumbSize = 220 * scale;
      const spacing = 30 * scale;
      const rows = Math.ceil(count / 3);

      // Calculate total height of grid to center it vertically
      // Row 1 height + spacing + Row 2 height
      const rowHeight = thumbSize + 28 * scale + 10 * scale; // thumbSize + pBottom + pBorder
      const totalGridHeight = rows * rowHeight + (rows - 1) * spacing;
      const gridTop = (h - totalGridHeight) / 2 + 50 * scale; // centered vertically with a slight downward push for the title/stats

      photosToShow.forEach((photo, idx) => {
        const r = Math.floor(idx / 3);
        const c = idx % 3;

        const itemsInRow = (r === rows - 1) ? (count - r * 3) : 3;
        const rowWidth = itemsInRow * thumbSize + (itemsInRow - 1) * spacing;

        const startX = (w - rowWidth) / 2 + thumbSize / 2;
        const px = startX + c * (thumbSize + spacing);
        const py = gridTop + r * (rowHeight + spacing);

        ctx.save();
        ctx.translate(px, py);

        const rotations = [-5, 3, -3, 4, -2, 5];
        ctx.rotate(rotations[idx % rotations.length] * Math.PI / 180);

        const pBorder = 12 * scale;
        const pBottom = 34 * scale;

        // Polaroid Border
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 16 * scale;
        ctx.shadowOffsetY = 6 * scale;
        ctx.fillRect(-thumbSize / 2 - pBorder, -thumbSize / 2 - pBorder, thumbSize + pBorder * 2, thumbSize + pBorder + pBottom);

        // Polaroid Image
        ctx.shadowColor = 'transparent';
        const img = photo.img;
        if (img && img.complete && img.width > 0) {
          let sx, sy, sWidth, sHeight;
          const aspect = img.width / img.height;
          if (aspect > 1) {
            sHeight = img.height;
            sWidth = img.height;
            sx = (img.width - sWidth) / 2;
            sy = 0;
          } else {
            sWidth = img.width;
            sHeight = img.width;
            sx = 0;
            sy = (img.height - sHeight) / 2;
          }
          ctx.drawImage(img, sx, sy, sWidth, sHeight, -thumbSize / 2, -thumbSize / 2, thumbSize, thumbSize);
        } else {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(-thumbSize / 2, -thumbSize / 2, thumbSize, thumbSize);
        }

        ctx.restore();
      });
    }
  } catch (error) {
    console.error("Error drawing summary screen:", error);
  }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
