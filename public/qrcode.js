/**
 * Zero-dependency 100% Offline ISO/IEC 18004 QR Code SVG Generator (Level M, Byte Mode, Versions 1-10)
 * Exposes window.generateQrSvg(text, sizePx) (and module.exports for Node unit tests).
 */
(function (root) {
  "use strict";

  // Version specifications for Error Correction Level M:
  // [version, totalCodewords, dataCodewords, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data, alignCenters]
  const QR_VERSIONS_M = [
    null,
    [1,   26,  16, 10, 1, 16, 0,  0, []],
    [2,   44,  28, 16, 1, 28, 0,  0, [6, 18]],
    [3,   70,  44, 26, 1, 44, 0,  0, [6, 22]],
    [4,  100,  64, 18, 2, 32, 0,  0, [6, 26]],
    [5,  134,  86, 24, 2, 43, 0,  0, [6, 30]],
    [6,  172, 108, 16, 4, 27, 0,  0, [6, 34]],
    [7,  196, 124, 18, 4, 31, 0,  0, [6, 22, 38]],
    [8,  242, 154, 22, 2, 38, 2, 39, [6, 24, 42]],
    [9,  292, 182, 22, 3, 36, 2, 37, [6, 26, 46]],
    [10, 346, 216, 26, 4, 43, 1, 44, [6, 28, 50]]
  ];

  // GF(256) with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGalois() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(ecLen) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < ecLen; i++) {
      const next = new Uint8Array(poly.length + 1);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncodeBlock(dataBytes, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const buf = new Uint8Array(dataBytes.length + ecLen);
    buf.set(dataBytes, 0);
    for (let i = 0; i < dataBytes.length; i++) {
      const coef = buf[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          buf[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return buf.slice(dataBytes.length);
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str);
    }
    const encoded = unescape(encodeURIComponent(str));
    const arr = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
      arr[i] = encoded.charCodeAt(i);
    }
    return arr;
  }

  function selectVersionForBytes(byteLen) {
    for (let v = 1; v < QR_VERSIONS_M.length; v++) {
      const spec = QR_VERSIONS_M[v];
      const countBits = v <= 9 ? 8 : 16;
      const totalDataBits = spec[2] * 8;
      if (4 + countBits + byteLen * 8 <= totalDataBits) {
        return spec;
      }
    }
    throw new Error("Testo troppo lungo per il generatore QR (max 213 byte).");
  }

  function buildDataCodewords(bytes, spec) {
    const version = spec[0];
    const dataCodewordsCount = spec[2];
    const countBits = version <= 9 ? 8 : 16;

    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    }

    // Mode indicator: 0100 (Byte mode)
    pushBits(4, 4);
    pushBits(bytes.length, countBits);
    for (let i = 0; i < bytes.length; i++) {
      pushBits(bytes[i], 8);
    }

    const totalBits = dataCodewordsCount * 8;
    const terminatorLen = Math.min(4, totalBits - bits.length);
    for (let i = 0; i < terminatorLen; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const out = new Uint8Array(dataCodewordsCount);
    let idx = 0;
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i + j];
      }
      out[idx++] = b;
    }

    let padToggle = 0;
    while (idx < dataCodewordsCount) {
      out[idx++] = padToggle === 0 ? 0xec : 0x11;
      padToggle ^= 1;
    }
    return out;
  }

  function interleaveAndAddEc(dataCodewords, spec) {
    const ecPerBlock = spec[3];
    const g1Blocks = spec[4];
    const g1Data = spec[5];
    const g2Blocks = spec[6];
    const g2Data = spec[7];

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;

    for (let i = 0; i < g1Blocks; i++) {
      const blk = dataCodewords.slice(offset, offset + g1Data);
      offset += g1Data;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncodeBlock(blk, ecPerBlock));
    }
    for (let i = 0; i < g2Blocks; i++) {
      const blk = dataCodewords.slice(offset, offset + g2Data);
      offset += g2Data;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncodeBlock(blk, ecPerBlock));
    }

    const result = [];
    const maxDataLen = Math.max(g1Data, g2Data);
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < dataBlocks.length; b++) {
        if (i < dataBlocks[b].length) {
          result.push(dataBlocks[b][i]);
        }
      }
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (let b = 0; b < ecBlocks.length; b++) {
        result.push(ecBlocks[b][i]);
      }
    }
    return new Uint8Array(result);
  }

  function computeFormatBits(maskId) {
    // EC level M = 00
    const data = maskId & 7;
    let rem = data << 10;
    for (let i = 4; i >= 0; i--) {
      if ((rem >>> (i + 10)) & 1) {
        rem ^= 0x537 << i;
      }
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  function computeVersionBits(version) {
    let rem = version << 12;
    for (let i = 5; i >= 0; i--) {
      if ((rem >>> (i + 12)) & 1) {
        rem ^= 0x1f25 << i;
      }
    }
    return (version << 12) | rem;
  }

  function createMatrix(spec) {
    const version = spec[0];
    const size = 21 + (version - 1) * 4;
    const alignCenters = spec[8];

    // modules[r][c]: 0 = light, 1 = dark; isFunc[r][c]: true if fixed function pattern
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    function setFunc(r, c, dark) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = dark ? 1 : 0;
      isFunc[r][c] = 1;
    }

    function drawFinder(top, left) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = top + dr;
          const c = left + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
          const dark = dist !== 2 && dist !== 4;
          setFunc(r, c, dark);
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      const dark = i % 2 === 0;
      setFunc(6, i, dark);
      setFunc(i, 6, dark);
    }

    // Alignment patterns
    for (let i = 0; i < alignCenters.length; i++) {
      for (let j = 0; j < alignCenters.length; j++) {
        const cr = alignCenters[i];
        const cc = alignCenters[j];
        const inTopLeft = cr <= 8 && cc <= 8;
        const inTopRight = cr <= 8 && cc >= size - 9;
        const inBottomLeft = cr >= size - 9 && cc <= 8;
        if (inTopLeft || inTopRight || inBottomLeft) continue;

        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFunc(cr + dr, cc + dc, dist === 0 || dist === 2);
          }
        }
      }
    }

    // Reserve Format Information areas (filled per mask during evaluation)
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        setFunc(8, i, false);
        setFunc(i, 8, false);
      }
    }
    for (let i = size - 8; i < size; i++) {
      setFunc(8, i, false);
      if (i > size - 8) setFunc(i, 8, false);
    }
    // Dark module
    setFunc(size - 8, 8, true);

    // Version Information (Versions >= 7)
    if (version >= 7) {
      const verBits = computeVersionBits(version);
      for (let i = 0; i < 18; i++) {
        const dark = ((verBits >>> i) & 1) === 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + (i % 3);
        setFunc(a, b, dark);
        setFunc(b, a, dark);
      }
    }

    return { size, modules, isFunc };
  }

  function placeCodewords(size, modules, isFunc, codewords) {
    let bitIdx = 0;
    const totalDataBits = codewords.length * 8;
    let upward = true;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (let lr = 0; lr < 2; lr++) {
          const c = right - lr;
          if (!isFunc[r][c]) {
            let dark = false;
            if (bitIdx < totalDataBits) {
              dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
              bitIdx++;
            }
            modules[r][c] = dark ? 1 : 0;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMaskAndFormat(size, baseModules, isFunc, maskId) {
    const m = Array.from({ length: size }, (_, r) => new Uint8Array(baseModules[r]));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isFunc[r][c]) continue;
        let invert = false;
        switch (maskId) {
          case 0: invert = (r + c) % 2 === 0; break;
          case 1: invert = r % 2 === 0; break;
          case 2: invert = c % 3 === 0; break;
          case 3: invert = (r + c) % 3 === 0; break;
          case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invert = ((r * c) % 2) + ((r * c) % 3) === 0; break;
          case 6: invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          case 7: invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        }
        if (invert) m[r][c] ^= 1;
      }
    }

    const fmt = computeFormatBits(maskId);
    // Format bits around top-left finder
    for (let i = 0; i <= 5; i++) m[8][i] = (fmt >>> (14 - i)) & 1;
    m[8][7] = (fmt >>> 8) & 1;
    m[8][8] = (fmt >>> 7) & 1;
    m[7][8] = (fmt >>> 6) & 1;
    for (let i = 0; i <= 5; i++) m[5 - i][8] = (fmt >>> (5 - i)) & 1;

    // Format bits around bottom-left and top-right finders
    for (let i = 0; i <= 6; i++) m[size - 1 - i][8] = (fmt >>> (14 - i)) & 1;
    for (let i = 0; i <= 7; i++) m[8][size - 8 + i] = (fmt >>> (7 - i)) & 1;

    return m;
  }

  function calcPenalty(size, m) {
    let penalty = 0;

    // N1: 5+ same-color modules in row or col
    for (let r = 0; r < size; r++) {
      let runCol = 1;
      let runRow = 1;
      for (let i = 1; i < size; i++) {
        if (m[r][i] === m[r][i - 1]) runRow++;
        else {
          if (runRow >= 5) penalty += 3 + (runRow - 5);
          runRow = 1;
        }
        if (m[i][r] === m[i - 1][r]) runCol++;
        else {
          if (runCol >= 5) penalty += 3 + (runCol - 5);
          runCol = 1;
        }
      }
      if (runRow >= 5) penalty += 3 + (runRow - 5);
      if (runCol >= 5) penalty += 3 + (runCol - 5);
    }

    // N2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }

    // N3: 1011101 with 4 light modules on either side
    function countN3(line) {
      let p = 0;
      for (let i = 0; i <= line.length - 11; i++) {
        const matchLeft =
          line[i] === 0 && line[i + 1] === 0 && line[i + 2] === 0 && line[i + 3] === 0 &&
          line[i + 4] === 1 && line[i + 5] === 0 && line[i + 6] === 1 && line[i + 7] === 1 &&
          line[i + 8] === 1 && line[i + 9] === 0 && line[i + 10] === 1;
        const matchRight =
          line[i] === 1 && line[i + 1] === 0 && line[i + 2] === 1 && line[i + 3] === 1 &&
          line[i + 4] === 1 && line[i + 5] === 0 && line[i + 6] === 1 &&
          line[i + 7] === 0 && line[i + 8] === 0 && line[i + 9] === 0 && line[i + 10] === 0;
        if (matchLeft || matchRight) p += 40;
      }
      return p;
    }
    const colBuf = new Uint8Array(size);
    for (let r = 0; r < size; r++) {
      penalty += countN3(m[r]);
      for (let c = 0; c < size; c++) colBuf[c] = m[c][r];
      penalty += countN3(colBuf);
    }

    // N4: dark/total ratio deviation from 50%
    let darkCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c]) darkCount++;
      }
    }
    const pct = (darkCount * 100) / (size * size);
    const k = Math.floor(Math.abs(pct - 50) / 5);
    penalty += k * 10;

    return penalty;
  }

  function encodeQrMatrix(text) {
    const bytes = utf8Bytes(String(text || ""));
    const spec = selectVersionForBytes(bytes.length);
    const dataCw = buildDataCodewords(bytes, spec);
    const fullCw = interleaveAndAddEc(dataCw, spec);

    const { size, modules, isFunc } = createMatrix(spec);
    placeCodewords(size, modules, isFunc, fullCw);

    let bestMatrix = null;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = applyMaskAndFormat(size, modules, isFunc, mask);
      const pen = calcPenalty(size, candidate);
      if (pen < bestPenalty) {
        bestPenalty = pen;
        bestMatrix = candidate;
      }
    }

    return { version: spec[0], size, matrix: bestMatrix };
  }

  function generateQrSvg(text, sizePx) {
    const px = Number(sizePx) || 220;
    const { size, matrix } = encodeQrMatrix(text);
    const quiet = 4;
    const total = size + quiet * 2;

    let d = "";
    for (let r = 0; r < size; r++) {
      let c = 0;
      while (c < size) {
        if (matrix[r][c] === 1) {
          const start = c;
          while (c < size && matrix[r][c] === 1) c++;
          d += `M${start + quiet},${r + quiet}h${c - start}v1h-${c - start}z`;
        } else {
          c++;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="Codice QR">
  <rect width="${total}" height="${total}" fill="#ffffff"/>
  <path d="${d}" fill="#0b0e14"/>
</svg>`;
  }

  root.generateQrSvg = generateQrSvg;
  root.encodeQrMatrix = encodeQrMatrix;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { generateQrSvg, encodeQrMatrix };
  }
})(typeof window !== "undefined" ? window : globalThis);
