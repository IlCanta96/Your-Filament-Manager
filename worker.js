// ============================================================================
// ELEGOO CENTAURI CARBON 2 — MULTI-USER CLOUDFLARE WORKER + CRON 24/7
// Supports any Elegoo Cloud account (RSA + AES-256-CBC Login & Token Login)
// ============================================================================

// ============================================================================
// CRYPTO HELPERS FOR ELEGOO CLOUD LOGIN (RSA PKCS#1 v1.5 + AES-256-CBC)
// ============================================================================
function randomString(chars, length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function aesEncryptBase64(plainText, keyStr, ivStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyStr),
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: enc.encode(ivStr) },
    key,
    enc.encode(plainText)
  );
  return bytesToBase64(new Uint8Array(cipherBuf));
}

function readAsn1Length(der, idxObj) {
  const b = der[idxObj.idx++];
  if ((b & 0x80) === 0) return b;
  const numBytes = b & 0x7f;
  let len = 0;
  for (let i = 0; i < numBytes; i++) {
    len = (len << 8) | der[idxObj.idx++];
  }
  return len;
}

function parseSpkiPublicKey(spkiBase64) {
  const cleaned = spkiBase64
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = base64ToBytes(cleaned);
  const p = { idx: 0 };

  if (der[p.idx++] !== 0x30) throw new Error("Invalid SPKI outer SEQUENCE");
  readAsn1Length(der, p);

  if (der[p.idx++] !== 0x30) throw new Error("Invalid AlgorithmIdentifier");
  const algLen = readAsn1Length(der, p);
  p.idx += algLen;

  if (der[p.idx++] !== 0x03) throw new Error("Invalid BIT STRING");
  readAsn1Length(der, p);
  p.idx += 1; // skip unused bits byte

  if (der[p.idx++] !== 0x30) throw new Error("Invalid RSAPublicKey SEQUENCE");
  readAsn1Length(der, p);

  if (der[p.idx++] !== 0x02) throw new Error("Invalid Modulus INTEGER");
  let modLen = readAsn1Length(der, p);
  if (der[p.idx] === 0x00) {
    p.idx += 1;
    modLen -= 1;
  }
  const modulusBytes = der.slice(p.idx, p.idx + modLen);
  p.idx += modLen;

  if (der[p.idx++] !== 0x02) throw new Error("Invalid Exponent INTEGER");
  let expLen = readAsn1Length(der, p);
  if (der[p.idx] === 0x00) {
    p.idx += 1;
    expLen -= 1;
  }
  const exponentBytes = der.slice(p.idx, p.idx + expLen);

  return { modulusBytes, exponentBytes };
}

function bytesToBigInt(bytes) {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function rsaEncryptSpkiBase64(plainText, spkiBase64) {
  const { modulusBytes, exponentBytes } = parseSpkiPublicKey(spkiBase64);
  const k = modulusBytes.length;
  const msgBytes = new TextEncoder().encode(plainText);
  if (msgBytes.length > k - 11) {
    throw new Error("Message too long for RSA PKCS#1 v1.5");
  }

  const em = new Uint8Array(k);
  em[0] = 0x00;
  em[1] = 0x02;
  const psLen = k - msgBytes.length - 3;
  const rnd = new Uint8Array(psLen);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < psLen; i++) {
    em[2 + i] = rnd[i] === 0 ? 1 : rnd[i];
  }
  em[2 + psLen] = 0x00;
  em.set(msgBytes, 3 + psLen);

  const m = bytesToBigInt(em);
  const n = bytesToBigInt(modulusBytes);
  const e = bytesToBigInt(exponentBytes);
  const c = modPow(m, e, n);

  const cHex = c.toString(16).padStart(k * 2, "0");
  const out = new Uint8Array(k);
  for (let i = 0; i < k; i++) {
    out[i] = parseInt(cHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytesToBase64(out);
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

function constantTimeEqualHex(hexA, hexB) {
  const a = hexToBytes(hexA);
  const b = hexToBytes(hexB);
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hashPasswordPBKDF2(password, existingSaltHex = "") {
  const enc = new TextEncoder();
  const saltBytes = existingSaltHex
    ? hexToBytes(existingSaltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(password || "")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return {
    saltHex: bytesToHex(saltBytes),
    hashHex: bytesToHex(new Uint8Array(derivedBits))
  };
}

async function verifyPasswordPBKDF2(password, saltHex, expectedHashHex) {
  if (!password || !saltHex || !expectedHashHex) return false;
  const { hashHex } = await hashPasswordPBKDF2(password, saltHex);
  return constantTimeEqualHex(hashHex, expectedHashHex);
}

// ============================================================================
// MULTI-USER STORAGE IN CLOUDFLARE DURABLE OBJECT
// ============================================================================
function normalizeAccountKey(raw) {
  return String(raw || "").trim().toLowerCase();
}

function resolveCanonicalAccountKey(accountKey, body) {
  const email = normalizeAccountKey(body?.auth?.user?.email || body?.auth?.email || "");
  if (email && email !== "token cloud") return email;
  const uid = normalizeAccountKey(body?.auth?.user?.id || "");
  if (uid) return uid;
  const paramKey = normalizeAccountKey(accountKey);
  if (paramKey && paramKey !== "token cloud") return paramKey;
  return normalizeAccountKey(body?.auth?.token || "");
}

export class FilamentStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const accountKey = normalizeAccountKey(url.searchParams.get("account") || "");

    if (request.method === "GET" && url.pathname === "/accounts") {
      const list = (await this.ctx.storage.get("accounts_list")) || [];
      return Response.json({ accounts: list });
    }

    if (request.method === "GET" && url.pathname === "/state") {
      if (!accountKey) {
        return Response.json({ empty: true });
      }
      let data = await this.ctx.storage.get("user:" + accountKey);
      if (!data) {
        return Response.json({ empty: true });
      }
      const canonicalKey = resolveCanonicalAccountKey(accountKey, data);
      if (canonicalKey && canonicalKey !== accountKey) {
        const canonicalData = await this.ctx.storage.get("user:" + canonicalKey);
        if (canonicalData && (canonicalData.updatedAt || 0) >= (data.updatedAt || 0)) {
          data = canonicalData;
        }
      }
      return Response.json(data);
    }

    if (request.method === "POST" && url.pathname === "/state") {
      const body = await request.json();
      const resolvedKey = resolveCanonicalAccountKey(accountKey, body);
      if (!resolvedKey) {
        return Response.json({ ok: false, error: "Missing account key" }, { status: 400 });
      }

      let currentStored = await this.ctx.storage.get("user:" + resolvedKey);
      if (!currentStored && accountKey && accountKey !== resolvedKey) {
        currentStored = await this.ctx.storage.get("user:" + accountKey);
      }

      // If this is a background cron save, only override spool weights if the user
      // manually edited a spool AFTER this sync started (server updatedAt changed and version/edit timestamp increased)
      if (body.isBackgroundSync) {
        const baseUpdatedAt = Number(body.baseUpdatedAt || 0);
        const newlyDeductedBySpool = body.newlyDeductedBySpool || {};
        const storedChangedDuringSync = currentStored && Number(currentStored.updatedAt || 0) !== baseUpdatedAt;

        if (storedChangedDuringSync && Array.isArray(currentStored.spools) && Array.isArray(body.spools)) {
          for (const storedSpool of currentStored.spools) {
            if (storedSpool && storedSpool.userEdited) {
              const target = body.spools.find(
                s => s.id === storedSpool.id || (Number(s.slot) > 0 && Number(s.slot) === Number(storedSpool.slot))
              );
              const storedVer = Number(storedSpool.userEditVersion || storedSpool.userEditedAt || 0);
              const targetVer = target ? Number(target.userEditVersion || target.userEditedAt || 0) : 0;
              if (target && storedVer > targetVer) {
                const newlyDeducted = Number(newlyDeductedBySpool[target.id] || 0);
                target.name = storedSpool.name;
                target.material = storedSpool.material;
                target.color = storedSpool.color;
                target.initialWeight = storedSpool.initialWeight;
                target.remainingWeight = Math.max(0, round1(Number(storedSpool.remainingWeight || 0) - newlyDeducted));
                target.manualRemainingWeight = storedSpool.manualRemainingWeight;
                target.userEdited = true;
                target.userEditedAt = storedSpool.userEditedAt;
                if (storedSpool.userEditVersion !== undefined) {
                  target.userEditVersion = storedSpool.userEditVersion;
                }
              }
            }
          }
        }

        // Preserve any manual prints added by the user during the cron sync window
        if (currentStored && Array.isArray(currentStored.prints) && Array.isArray(body.prints)) {
          for (const sp of currentStored.prints) {
            if (sp && (sp.timestamp || 0) > baseUpdatedAt && !body.prints.some(p => p.id === sp.id || (sp.cloudTaskId && p.cloudTaskId === sp.cloudTaskId))) {
              body.prints.unshift(sp);
            }
          }
        }

        delete body.isBackgroundSync;
        delete body.baseUpdatedAt;
        delete body.newlyDeductedBySpool;
      } else {
        // Browser save: merge any cloud prints synced in the background while the browser tab had older data
        const baseUpdatedAt = Number(body.baseUpdatedAt || 0);
        if (currentStored) {
          if (currentStored.fileMetaCache && typeof currentStored.fileMetaCache === "object") {
            body.fileMetaCache = { ...currentStored.fileMetaCache, ...(body.fileMetaCache || {}) };
          }
          if (currentStored.liveSnapshotsByFile && typeof currentStored.liveSnapshotsByFile === "object") {
            body.liveSnapshotsByFile = { ...currentStored.liveSnapshotsByFile, ...(body.liveSnapshotsByFile || {}) };
          }
          const manualDeleted = new Set([
            ...(Array.isArray(currentStored.manuallyDeletedTaskIds) ? currentStored.manuallyDeletedTaskIds.map(String) : []),
            ...(Array.isArray(body.manuallyDeletedTaskIds) ? body.manuallyDeletedTaskIds.map(String) : [])
          ]);
          body.manuallyDeletedTaskIds = Array.from(manualDeleted);

          if (Array.isArray(currentStored.prints) && Array.isArray(body.prints)) {
            const clientHadOlderState = baseUpdatedAt > 0 && baseUpdatedAt < Number(currentStored.updatedAt || 0);
            for (const sp of currentStored.prints) {
              if (!sp || !sp.cloudTaskId || String(sp.cloudTaskId).startsWith("manual-")) continue;
              if (manualDeleted.has(String(sp.cloudTaskId))) continue;
              const alreadyInBody = body.prints.some(p => p.cloudTaskId === sp.cloudTaskId || p.id === sp.id);
              if (!alreadyInBody && clientHadOlderState) {
                body.prints.unshift(sp);
                if (sp.gramsDeducted && sp.actualGrams > 0 && Array.isArray(body.spools)) {
                  const target = body.spools.find(s => s.id === sp.spoolId);
                  if (target && Number(sp.timestamp || 0) >= Number(target.userEditedAt || 0)) {
                    target.remainingWeight = Math.max(0, round1(Number(target.remainingWeight || 0) - Number(sp.actualGrams)));
                  }
                }
              }
            }
          }
        }
        delete body.baseUpdatedAt;
        delete body.newlyDeductedBySpool;
      }

      // Preserve server-only password verifier & subscription metadata across saves
      if (currentStored?.auth) {
        body.auth = body.auth || {};
        if (currentStored.auth.passwordHash && !body.auth.passwordHash) {
          body.auth.passwordHash = currentStored.auth.passwordHash;
        }
        if (currentStored.auth.passwordSalt && !body.auth.passwordSalt) {
          body.auth.passwordSalt = currentStored.auth.passwordSalt;
        }
      }
      if (!body.subscription) {
        body.subscription = currentStored?.subscription || { tier: "free", active: true };
      }

      // Stamp monotonic server-side timestamp so concurrent saves are always distinguishable even within 1ms or under client clock skew
      body.updatedAt = Math.max(Date.now(), Number(currentStored?.updatedAt || 0) + 1);
      body.accountKey = resolvedKey;
      await this.ctx.storage.put("user:" + resolvedKey, body);

      const aliasKeys = new Set();
      const emailAlias = normalizeAccountKey(body?.auth?.user?.email || body?.auth?.email || "");
      if (emailAlias && emailAlias !== "token cloud" && emailAlias !== resolvedKey) aliasKeys.add(emailAlias);

      const uid = normalizeAccountKey(body?.auth?.user?.id || "");
      if (uid && uid !== resolvedKey) aliasKeys.add(uid);

      const tok = normalizeAccountKey(body?.auth?.token || "");
      if (tok && tok !== resolvedKey) aliasKeys.add(tok);

      if (accountKey && accountKey !== "token cloud" && accountKey !== resolvedKey) {
        aliasKeys.add(accountKey);
      }

      for (const alias of aliasKeys) {
        await this.ctx.storage.put("user:" + alias, body);
      }

      if (Array.isArray(body.validTokens)) {
        for (const vt of body.validTokens) {
          const normVt = normalizeAccountKey(vt);
          if (normVt && normVt !== resolvedKey) aliasKeys.add(normVt);
        }
      }

      // Deduplicate accounts_list: keep only the canonical key for this user
      const list = (await this.ctx.storage.get("accounts_list")) || [];
      const cleanedList = list.filter(k => k === resolvedKey || !aliasKeys.has(k));
      if (!cleanedList.includes(resolvedKey)) {
        cleanedList.push(resolvedKey);
      }
      if (cleanedList.length !== list.length || !list.includes(resolvedKey)) {
        await this.ctx.storage.put("accounts_list", cleanedList);
      }

      return Response.json({ ok: true, accountKey: resolvedKey });
    }

    return new Response("Not Found", { status: 404 });
  }
}

async function getAllAccountKeys(env) {
  const id = env.FILAMENT_STORE.idFromName("global");
  const stub = env.FILAMENT_STORE.get(id);
  const res = await stub.fetch("https://internal/accounts", { method: "GET" });
  const data = await res.json();
  return data.accounts || [];
}

async function getDbStateForAccount(env, accountKey) {
  const key = normalizeAccountKey(accountKey);
  if (!key) return null;
  const id = env.FILAMENT_STORE.idFromName("global");
  const stub = env.FILAMENT_STORE.get(id);
  const res = await stub.fetch(`https://internal/state?account=${encodeURIComponent(key)}`, { method: "GET" });
  const data = await res.json();
  return data && !data.empty ? data : null;
}

async function saveDbStateForAccount(env, accountKey, state) {
  const key = resolveCanonicalAccountKey(accountKey, state);
  if (!key) return;
  state.updatedAt = Date.now();
  const id = env.FILAMENT_STORE.idFromName("global");
  const stub = env.FILAMENT_STORE.get(id);
  await stub.fetch(`https://internal/state?account=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
}

function getMatrixBaseUrl(region) {
  return region === "cn" ? "https://matrix.elegoo.com.cn" : "https://matrix.elegoo.com";
}

function getMatrixHeaders(token) {
  const h = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ElegooSlicer/1.2.0"
  };
  if (token) {
    const clean = String(token).replace(/^Bearer\s+/i, "").trim();
    h["Authorization"] = `Bearer ${clean}`;
    h["token"] = clean;
    h["X-Token"] = clean;
  }
  return h;
}

async function matrixFetch(region, token, endpoint, method = "GET", payload = null) {
  const baseUrl = getMatrixBaseUrl(region);
  const url = baseUrl + endpoint;
  const opts = {
    method,
    headers: getMatrixHeaders(token)
  };
  if (payload && method !== "GET") {
    opts.body = typeof payload === "string" ? payload : JSON.stringify(payload);
  }
  const resp = await fetch(url, opts);
  return await resp.json();
}

function round1(num) {
  return Math.round((Number(num) + Number.EPSILON) * 10) / 10;
}

const COLOR_NAMES_IT = {
  "#FFFFFF": "Bianco",
  "#F5F7FA": "Bianco",
  "#898989": "Grigio",
  "#808080": "Grigio",
  "#7C8594": "Grigio",
  "#F72221": "Rosso",
  "#FF3B30": "Rosso",
  "#FF0000": "Rosso",
  "#000000": "Nero",
  "#1E1E24": "Nero",
  "#22252E": "Nero",
  "#00D2FF": "Ciano",
  "#36A8E1": "Azzurro",
  "#007AFF": "Blu",
  "#34C759": "Verde",
  "#00FF00": "Verde",
  "#FFCC00": "Giallo",
  "#FFFF00": "Giallo",
  "#FF9500": "Arancione",
  "#AF52DE": "Viola"
};

const DEFAULT_IGNORED_OLD_TASK_IDS = [];

function normalizeColorHex(raw) {
  if (!raw) return "";
  let str = String(raw).trim().replace(/^#/, "").replace(/^0x/i, "");
  if (str.length === 8) str = str.slice(0, 6);
  if (/^[0-9A-Fa-f]{6}$/.test(str)) return "#" + str.toUpperCase();
  return "";
}

function parseHexToRgb(hex) {
  const norm = normalizeColorHex(hex);
  if (!norm) return null;
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16)
  };
}

function guessColorNameItalian(hex) {
  const norm = normalizeColorHex(hex);
  if (norm && COLOR_NAMES_IT[norm]) return COLOR_NAMES_IT[norm];
  const rgb = parseHexToRgb(norm);
  if (!rgb) return "Colore";
  const { r, g, b } = rgb;
  if (r > 225 && g > 225 && b > 225) return "Bianco";
  if (r < 38 && g < 38 && b < 38) return "Nero";
  if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) return "Grigio";
  if (r > 180 && g < 85 && b < 85) return "Rosso";
  if (r > 200 && g > 170 && b < 70) return "Giallo";
  if (r > 200 && g > 95 && b < 60) return "Arancione";
  if (g > 150 && r < 100 && b < 110) return "Verde";
  if (b > 160 && r < 95) return "Blu";
  return norm || "Colore";
}

function areColorsEquivalentOnCanvas(hexA, hexB) {
  const a = normalizeColorHex(hexA);
  const b = normalizeColorHex(hexB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (COLOR_NAMES_IT[a] && COLOR_NAMES_IT[b] && COLOR_NAMES_IT[a] === COLOR_NAMES_IT[b]) return true;
  const guessA = guessColorNameItalian(a);
  const guessB = guessColorNameItalian(b);
  if (!guessA.startsWith("#") && guessA === guessB) return true;
  const rgbA = parseHexToRgb(a);
  const rgbB = parseHexToRgb(b);
  if (!rgbA || !rgbB) return false;
  const dist = Math.sqrt(
    Math.pow(rgbA.r - rgbB.r, 2) +
    Math.pow(rgbA.g - rgbB.g, 2) +
    Math.pow(rgbA.b - rgbB.b, 2)
  );
  return dist < 60;
}

function normalizeFileKey(name) {
  return String(name || "").trim().replace(/^\/+/, "").toLowerCase();
}

function unpackCloudReportData(rawData) {
  if (!rawData) return {};
  if (Array.isArray(rawData)) {
    const map = {};
    for (const item of rawData) {
      if (item && item.reportLinkKey) {
        try {
          map[item.reportLinkKey] = typeof item.reportValue === "string" ? JSON.parse(item.reportValue) : item.reportValue;
        } catch {
          map[item.reportLinkKey] = item.reportValue;
        }
      }
    }
    return map;
  }
  if (typeof rawData !== "object") return {};
  const result = {};
  for (const [key, val] of Object.entries(rawData)) {
    if (Array.isArray(val)) {
      const subObj = {};
      for (const item of val) {
        const linkKey = item?.reportLinkKey;
        const rawVal = item?.reportValue;
        if (!linkKey) continue;
        if (typeof rawVal === "string") {
          const trimmed = rawVal.trim();
          if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
              subObj[linkKey] = JSON.parse(trimmed);
              continue;
            } catch {}
          }
        }
        subObj[linkKey] = rawVal;
      }
      result[key] = subObj;
    } else if (typeof val === "string") {
      try { result[key] = JSON.parse(val); } catch { result[key] = val; }
    } else {
      result[key] = val;
    }
  }
  return result;
}

function ensureFourCanvasSlotsExist(state) {
  const defaultColors = ["#FFFFFF", "#898989", "#F72221", "#000000"];
  state.spools = state.spools || [];
  for (let slotNum = 1; slotNum <= 4; slotNum++) {
    const exists = state.spools.some(s => Number(s.slot) === slotNum);
    if (!exists) {
      const col = defaultColors[slotNum - 1];
      state.spools.push({
        id: `spool-slot-${slotNum}`,
        name: `PLA ${guessColorNameItalian(col)}`,
        material: "PLA",
        color: col,
        initialWeight: 1000,
        remainingWeight: 1000,
        slot: slotNum,
        createdAt: Date.now()
      });
    }
  }
}

function getLiveSnapshotForTask(state, filename, baseFilename, ev) {
  const snaps = state.liveSnapshotsByFile || {};
  return (
    snaps[filename] ||
    snaps[baseFilename] ||
    snaps[normalizeFileKey(baseFilename)] ||
    (ev?.file_create_time ? snaps["ctime:" + ev.file_create_time] : null) ||
    null
  );
}

function findCachedFileMeta(state, filename, baseFilename, ev) {
  const cache = state.fileMetaCache || {};
  const direct =
    cache[filename] ||
    cache[normalizeFileKey(filename)] ||
    cache[normalizeFileKey(baseFilename)] ||
    (ev?.file_create_time ? cache["ctime:" + ev.file_create_time] : null);
  if (direct) return direct;

  const targetKey = normalizeFileKey(baseFilename);
  for (const [k, v] of Object.entries(cache)) {
    if (v && (normalizeFileKey(k) === targetKey || normalizeFileKey(v.filename) === targetKey)) {
      return v;
    }
  }
  return null;
}

function parseSlicerTimeSecFromFilename(filename) {
  const match = String(filename || "").match(/_(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?\.gcode$/i);
  if (!match) return 0;
  const d = Number(match[1] || 0);
  const h = Number(match[2] || 0);
  const m = Number(match[3] || 0);
  const s = Number(match[4] || 0);
  const total = d * 86400 + h * 3600 + m * 60 + s;
  return total > 0 ? total : 0;
}

function parseLayerHeightFromFilename(filename) {
  const match = String(filename || "").match(/_(0\.\d+)_(?:\d+h|\d+m|\d+s)/i);
  if (!match) return 0.2;
  const lh = parseFloat(match[1]);
  return lh > 0 && lh <= 1.0 ? lh : 0.2;
}

function resolveSlotForPrint(state, fileMeta, filename, ev = null) {
  const baseFilename = String(filename || "").split("/").pop().split("\\").pop();
  const snap = getLiveSnapshotForTask(state, filename, baseFilename, ev);

  // 1. Check live active slot captured while printing
  if (snap && snap.activeSlot >= 1 && snap.activeSlot <= 4) {
    if (!fileMeta?.colorMap) {
      return Number(snap.activeSlot);
    }
  }

  // 2. Check colorMap from Elegoo Slicer / printer file metadata
  if (fileMeta && fileMeta.colorMap) {
    try {
      const cmap = typeof fileMeta.colorMap === "string" ? JSON.parse(fileMeta.colorMap) : fileMeta.colorMap;
      if (Array.isArray(cmap) && cmap.length > 0) {
        const tRaw = cmap[0].t;
        const tSlot = tRaw !== undefined && Number(tRaw) >= 0 && Number(tRaw) <= 3 ? Number(tRaw) + 1 : null;

        if (cmap[0].color) {
          if (tSlot) {
            const tSpool = state.spools.find(s => Number(s.slot) === tSlot);
            if (tSpool && areColorsEquivalentOnCanvas(tSpool.color, cmap[0].color)) {
              return tSlot;
            }
          }
          const matchByColor = state.spools.find(
            s => s.slot >= 1 && s.slot <= 4 && areColorsEquivalentOnCanvas(s.color, cmap[0].color)
          );
          if (matchByColor) return Number(matchByColor.slot);
        }

        if (tSlot) return tSlot;
      }
    } catch {}
  }

  // 3. Fallback to snapshot activeSlot or lastActiveSlot
  if (snap && snap.activeSlot >= 1 && snap.activeSlot <= 4) {
    return Number(snap.activeSlot);
  }
  if (state.lastActiveSlot >= 1 && state.lastActiveSlot <= 4) {
    return Number(state.lastActiveSlot);
  }

  return 1;
}

function reconcileExistingPrintsAndSpools(state) {
  let changed = false;
  const manualDeleted = new Set((state.manuallyDeletedTaskIds || []).map(String));
  const defaultIgnored = new Set(DEFAULT_IGNORED_OLD_TASK_IDS);

  // Recover any recent tasks that were accidentally ignored due to missing local-file metadata
  if (Array.isArray(state.ignoredCloudTaskIds)) {
    const cleanedIgnored = state.ignoredCloudTaskIds.filter(id => {
      const sid = String(id);
      return defaultIgnored.has(sid) || manualDeleted.has(sid);
    });
    if (cleanedIgnored.length !== state.ignoredCloudTaskIds.length) {
      state.ignoredCloudTaskIds = cleanedIgnored;
      changed = true;
    }
  }

    // Reconcile existing prints that have not yet been verified as deducted (e.g. due to prior isBackgroundSync bug)
  for (const p of state.prints || []) {
    if (!p || p.gramsDeducted) continue;

    const fileMeta = (!p.spoolManuallyEdited || Number(p.actualGrams || 0) <= 0)
      ? findCachedFileMeta(state, p.filename, p.filename, null)
      : null;

    // Recalculate zero-gram un-deducted prints if fileMeta or filename duration estimate is available
    if (Number(p.actualGrams || 0) <= 0) {
      let recoveredGrams = 0;
      if (fileMeta && Number(fileMeta.totalFilamentUsedGrams || 0) > 0) {
        recoveredGrams = round1(Number(fileMeta.totalFilamentUsedGrams));
      } else {
        const durSec = parseSlicerTimeSecFromFilename(p.filename) || Number(p.duration || 0);
        if (durSec > 0) {
          recoveredGrams = round1(estimateFilamentGramsFromDuration(durSec, p.filename));
        }
      }
      if (recoveredGrams > 0) {
        p.totalEstimatedGrams = recoveredGrams;
        p.actualGrams = recoveredGrams;
        changed = true;
      }
    }

    // Re-evaluate target spool if it wasn't manually edited and fileMeta is available
    if (!p.spoolManuallyEdited && p.cloudTaskId && !String(p.cloudTaskId).startsWith("manual-")) {
      if (fileMeta) {
        const resolvedSlot = resolveSlotForPrint(state, fileMeta, p.filename, null);
        const resolvedSpool = state.spools.find(s => Number(s.slot) === Number(resolvedSlot));
        if (resolvedSpool && resolvedSpool.id !== p.spoolId) {
          p.spoolId = resolvedSpool.id;
          changed = true;
        }
      }
    }

    const spool = state.spools.find(s => s.id === p.spoolId) || state.spools[0];
    if (spool) {
      if (Number(p.actualGrams || 0) > 0) {
        spool.remainingWeight = Math.max(0, round1(Number(spool.remainingWeight || 0) - Number(p.actualGrams)));
      }
      p.gramsDeducted = true;
      changed = true;
    }
  }

  return changed;
}

/**
 * Syncs a single user's Elegoo Cloud account in the background
 */
async function syncAccountWithElegooCloud(env, accountKey) {
  const state = await getDbStateForAccount(env, accountKey);
  if (!state?.auth?.loggedIn || !state?.auth?.token) return { synced: false };

  const baseUpdatedAt = Number(state.updatedAt || 0);
  const newlyDeductedBySpool = {};
  const region = state.auth.region || "intl";
  const token = state.auth.token;
  let sn = state.selectedPrinterSn;
  let changed = false;

  if (!sn) {
    const devResp = await matrixFetch(region, token, "/api/v1/device-management-server/device/list", "GET");
    if (devResp?.data?.length > 0) {
      sn = devResp.data[0].serialNo;
      state.selectedPrinterSn = sn;
      changed = true;
    }
  }
  if (!sn) return { synced: false };

  state.fileMetaCache = state.fileMetaCache || {};
  state.liveSnapshotsByFile = state.liveSnapshotsByFile || {};
  state.ignoredCloudTaskIds = state.ignoredCloudTaskIds || [...DEFAULT_IGNORED_OLD_TASK_IDS];
  state.manuallyDeletedTaskIds = state.manuallyDeletedTaskIds || [];
  state.spools = state.spools || [];
  state.prints = state.prints || [];

  ensureFourCanvasSlotsExist(state);
  if (reconcileExistingPrintsAndSpools(state)) {
    changed = true;
  }

  // 1. Live Report Data (unpacked from Elegoo Cloud report-data/list object)
  const reportResp = await matrixFetch(
    region,
    token,
    `/api/v1/device-management-server/device/report-data/list?deviceCode=${encodeURIComponent(sn)}`,
    "GET"
  );

  if (reportResp && reportResp.data) {
    const map = unpackCloudReportData(reportResp.data);
    const ms = map.machine_status || {};
    const ps = map.print_status || {};
    const ci = map.canvas_info || {};

    let activeTrayZeroIdx = -1;
    if (ci.active_tray_id !== undefined && ci.active_tray_id !== "") {
      activeTrayZeroIdx = Number(ci.active_tray_id);
    }
    if (activeTrayZeroIdx >= 0 && activeTrayZeroIdx <= 3) {
      state.lastActiveSlot = activeTrayZeroIdx + 1;
      state.lastActiveSlotAt = Date.now();
      changed = true;
    }

    const progress = Number(ms.progress ?? ps.progress ?? 0);
    const currentLayer = Number(ps.current_layer ?? 0);
    const totalLayer = Number(ps.total_layer ?? 0);
    const printDuration = Number(ps.print_duration ?? 0);
    const fileCreateTime = String(ps.file_create_time || "").trim();
    const activeSlot = activeTrayZeroIdx >= 0 && activeTrayZeroIdx <= 3 ? activeTrayZeroIdx + 1 : null;

    if (ps.filename) {
      const fn = String(ps.filename).trim();
      const baseFn = fn.split("/").pop().split("\\").pop();
      const prev = state.liveSnapshotsByFile[fn] || state.liveSnapshotsByFile[normalizeFileKey(baseFn)] || {};
      const snap = {
        progress: progress > 0 && progress < 100 ? Math.max(progress, prev.progress || 0) : (prev.progress || 0),
        currentLayer: Math.max(currentLayer, prev.currentLayer || 0),
        totalLayer: totalLayer || prev.totalLayer || 0,
        printDuration: Math.max(printDuration, prev.printDuration || 0),
        activeSlot: activeSlot || prev.activeSlot || undefined,
        updatedAt: Date.now()
      };
      state.liveSnapshotsByFile[fn] = snap;
      state.liveSnapshotsByFile[normalizeFileKey(baseFn)] = snap;
      if (fileCreateTime && fileCreateTime !== "0") {
        state.liveSnapshotsByFile["ctime:" + fileCreateTime] = snap;
      }
      changed = true;
    } else if (fileCreateTime && fileCreateTime !== "0" && (printDuration > 0 || activeSlot)) {
      const ckey = "ctime:" + fileCreateTime;
      const prev = state.liveSnapshotsByFile[ckey] || {};
      state.liveSnapshotsByFile[ckey] = {
        progress: progress > 0 && progress < 100 ? Math.max(progress, prev.progress || 0) : (prev.progress || 0),
        currentLayer: Math.max(currentLayer, prev.currentLayer || 0),
        totalLayer: totalLayer || prev.totalLayer || 0,
        printDuration: Math.max(printDuration, prev.printDuration || 0),
        activeSlot: activeSlot || prev.activeSlot || undefined,
        updatedAt: Date.now()
      };
    }

    let trays = [];
    if (Array.isArray(ci.canvas_list)) {
      for (const unit of ci.canvas_list) {
        if (Array.isArray(unit.tray_list)) trays.push(...unit.tray_list);
      }
    } else if (Array.isArray(ci.tray_list)) {
      trays = ci.tray_list;
    }

    if (trays.length > 0) {
      const isZeroIndexed = trays.some(t => Number(t.tray_id ?? t.trayId) === 0);
      trays.forEach((tray, idx) => {
        const rawId = tray.tray_id ?? tray.trayId;
        const slotNum = rawId !== undefined
          ? (isZeroIndexed ? Number(rawId) + 1 : Number(rawId))
          : (idx + 1);
        if (slotNum < 1 || slotNum > 4) return;

        const currentInSlot = state.spools.find(s => Number(s.slot) === slotNum);
        const trayStatus = tray.status !== undefined ? Number(tray.status) : 1;
        const rawColorStr = String(tray.filament_color || tray.color || "").trim();

        if (trayStatus === 0 && !rawColorStr) {
          if (currentInSlot) {
            currentInSlot.slot = 0;
            currentInSlot.unmountedAt = Date.now();
            changed = true;
          }
          return;
        }
        if (!rawColorStr) return;

        const cloudColor = normalizeColorHex(rawColorStr);
        const cloudMaterial = String(tray.filament_type || tray.material || "PLA").trim();

        if (currentInSlot) {
          const prevCloudColor = normalizeColorHex(currentInSlot.cloudColor || currentInSlot.color);
          const isPlaceholder = prevCloudColor === "#3A7BD5";
          const sameColor = !isPlaceholder && areColorsEquivalentOnCanvas(prevCloudColor, cloudColor);
          if (sameColor) {
            if (currentInSlot.cloudColor !== cloudColor) {
              currentInSlot.cloudColor = cloudColor;
              if (!currentInSlot.userEdited) {
                currentInSlot.color = cloudColor;
              }
              changed = true;
            }
            if ((isPlaceholder || !currentInSlot.userEdited) && cloudMaterial) {
              if (currentInSlot.material !== cloudMaterial) {
                currentInSlot.material = cloudMaterial;
                changed = true;
              }
              const autoName = `${cloudMaterial} ${guessColorNameItalian(cloudColor)}`;
              if (currentInSlot.name !== autoName) {
                currentInSlot.name = autoName;
                changed = true;
              }
            }
          } else {
            currentInSlot.slot = 0;
            currentInSlot.unmountedAt = Date.now();
            const matchingArchived = state.spools.find(
              s => (!s.slot || Number(s.slot) === 0) &&
                s.id !== currentInSlot.id &&
                areColorsEquivalentOnCanvas(s.color, cloudColor)
            );
            if (matchingArchived) {
              matchingArchived.slot = slotNum;
              matchingArchived.color = cloudColor;
              matchingArchived.cloudColor = cloudColor;
            } else {
              state.spools.push({
                id: "spool-slot-" + slotNum + "-" + Date.now(),
                name: `${cloudMaterial} ${guessColorNameItalian(cloudColor)}`,
                material: cloudMaterial,
                color: cloudColor,
                cloudColor: cloudColor,
                initialWeight: 1000,
                remainingWeight: 1000,
                slot: slotNum,
                createdAt: Date.now()
              });
            }
            changed = true;
          }
        } else {
          const matchingArchived = state.spools.find(
            s => (!s.slot || Number(s.slot) === 0) && areColorsEquivalentOnCanvas(s.color, cloudColor)
          );
          if (matchingArchived) {
            matchingArchived.slot = slotNum;
            matchingArchived.color = cloudColor;
            matchingArchived.cloudColor = cloudColor;
          } else {
            state.spools.push({
              id: "spool-slot-" + slotNum + "-" + Date.now(),
              name: `${cloudMaterial} ${guessColorNameItalian(cloudColor)}`,
              material: cloudMaterial,
              color: cloudColor,
              cloudColor: cloudColor,
              initialWeight: 1000,
              remainingWeight: 1000,
              slot: slotNum,
              createdAt: Date.now()
            });
          }
          changed = true;
        }
      });
    }
  }

  // 2. Cache Local Files on Printer
  try {
    const filesResp = await matrixFetch(
      region,
      token,
      `/api/v1/device-management-server/local-file/page?serialNo=${encodeURIComponent(sn)}&pageNo=1&pageSize=100`,
      "GET"
    );
    const fileList = filesResp?.data?.list || filesResp?.data?.records || (Array.isArray(filesResp?.data) ? filesResp.data : []);
    for (const f of fileList) {
      if (!f || !f.filename) continue;
      const baseOnly = f.filename.split("/").pop().split("\\").pop();
      const key = normalizeFileKey(baseOnly);
      if (!state.fileMetaCache[key]) changed = true;
      const entry = {
        filename: baseOnly,
        fullFilename: f.filename,
        totalFilamentUsed: Number(f.totalFilamentUsed ?? f.filamentUsed ?? 0),
        totalFilamentUsedLength: Number(f.totalFilamentUsedLength ?? 0),
        printTime: Number(f.printTime || 0),
        layer: Number(f.layer || 0),
        createTime: Number(f.createTime || 0),
        colorMap: f.colorMap || null,
        cachedAt: Date.now()
      };
      state.fileMetaCache[f.filename] = entry;
      state.fileMetaCache[normalizeFileKey(f.filename)] = entry;
      state.fileMetaCache[key] = entry;
      if (entry.createTime > 0) {
        state.fileMetaCache["ctime:" + entry.createTime] = entry;
        state.fileMetaCache["ctime:" + Math.floor(entry.createTime / 1000)] = entry;
      }
    }
  } catch {}

  // 3. Process Print History Tasks
  const historyResp = await matrixFetch(
    region,
    token,
    `/api/v1/device-management-server/device/event-data/page?deviceCode=${encodeURIComponent(sn)}&pageNo=1&pageSize=50&eventKey=history_task&sort=create_time,desc`,
    "GET"
  );

  const historyItems = historyResp?.data?.list || historyResp?.data?.records || [];
  const orderedItems = [...historyItems].reverse();

  for (const item of orderedItems) {
    const cloudId = String(item.id || "");
    if (!cloudId) continue;
    if (DEFAULT_IGNORED_OLD_TASK_IDS.includes(cloudId)) continue;
    if (state.manuallyDeletedTaskIds.includes(cloudId)) continue;
    if (state.ignoredCloudTaskIds.includes(cloudId)) continue;
    if (state.prints.some(p => p.cloudTaskId === cloudId)) continue;

    let ev = null;
    try {
      ev = typeof item.eventValue === "string" ? JSON.parse(item.eventValue) : item.eventValue;
    } catch {
      continue;
    }
    if (!ev || !ev.task_name) continue;

    const filename = ev.task_name;
    const baseFilename = filename.split("/").pop().split("\\").pop();
    const taskStatus = Number(ev.task_status || 1);
    const beginTimeSec = Number(ev.begin_time || 0);
    const endTimeSec = Number(ev.end_time || 0);
    const durationSec = endTimeSec > beginTimeSec ? (endTimeSec - beginTimeSec) : 0;

    let fileMeta = findCachedFileMeta(state, filename, baseFilename, ev);

    if (!fileMeta) {
      const tryNames = filename === baseFilename ? [filename] : [filename, baseFilename];
      for (const qName of tryNames) {
        try {
          const singleFileResp = await matrixFetch(
            region,
            token,
            `/api/v1/device-management-server/local-file/filename?serialNo=${encodeURIComponent(sn)}&filename=${encodeURIComponent(qName)}`,
            "GET"
          );
          if (singleFileResp?.data?.filename) {
            const f = singleFileResp.data;
            fileMeta = {
              filename: baseFilename,
              fullFilename: f.filename,
              totalFilamentUsed: Number(f.totalFilamentUsed ?? f.filamentUsed ?? 0),
              totalFilamentUsedLength: Number(f.totalFilamentUsedLength ?? 0),
              printTime: Number(f.printTime || 0),
              layer: Number(f.layer || 0),
              createTime: Number(f.createTime || 0),
              colorMap: f.colorMap || null,
              cachedAt: Date.now()
            };
            state.fileMetaCache[f.filename] = fileMeta;
            state.fileMetaCache[normalizeFileKey(baseFilename)] = fileMeta;
            if (fileMeta.createTime > 0) {
              state.fileMetaCache["ctime:" + fileMeta.createTime] = fileMeta;
              state.fileMetaCache["ctime:" + Math.floor(fileMeta.createTime / 1000)] = fileMeta;
            }
            changed = true;
            break;
          }
        } catch {}
      }
    }

    const snapshot = getLiveSnapshotForTask(state, filename, baseFilename, ev);
    let isEstimatedFromTime = false;
    let totalFilamentUsedGrams = Number(fileMeta?.totalFilamentUsed ?? ev?.totalFilamentUsed ?? 0);
    if (totalFilamentUsedGrams <= 0) {
      const lenMm = Number(fileMeta?.totalFilamentUsedLength ?? ev?.totalFilamentUsedLength ?? 0);
      if (lenMm > 0) totalFilamentUsedGrams = round1((lenMm / 1000) * 2.98);
    }

    // Fallback for prints sent via LAN from ElegooSlicer that do not appear in Cloud local-file/page
    if (totalFilamentUsedGrams <= 0) {
      const slicerSec = parseSlicerTimeSecFromFilename(baseFilename);
      const snapDurSec = Number(snapshot?.printDuration || 0);
      const netExtrusionSec = durationSec > 300 ? Math.max(60, durationSec - 240) : durationSec;
      const estSec = slicerSec || snapDurSec || netExtrusionSec;
      if (estSec > 0) {
        const layerHeight = parseLayerHeightFromFilename(baseFilename);
        const layerScale = Math.max(0.3, Math.min(1.5, layerHeight / 0.2));
        totalFilamentUsedGrams = Math.max(0.5, round1(estSec * 0.012667 * layerScale));
        isEstimatedFromTime = true;
      }
    }

    if (totalFilamentUsedGrams <= 0) {
      continue;
    }

    const slotUsed = resolveSlotForPrint(state, fileMeta, filename, ev);

    let progressPct = 100;
    const estimatedPrintTimeSec = Number(fileMeta?.printTime || parseSlicerTimeSecFromFilename(baseFilename) || 0);

    if (taskStatus !== 1) {
      if (snapshot && snapshot.progress > 0 && snapshot.progress < 100) {
        progressPct = Math.round(snapshot.progress);
      } else if (snapshot && snapshot.totalLayer > 0 && snapshot.currentLayer > 0) {
        progressPct = Math.max(1, Math.min(99, Math.round((snapshot.currentLayer / snapshot.totalLayer) * 100)));
      } else if (estimatedPrintTimeSec > 0 && durationSec > 0) {
        const netExtrusionSec = Math.max(30, durationSec - 240);
        progressPct = Math.max(1, Math.min(99, Math.round((netExtrusionSec / estimatedPrintTimeSec) * 100)));
      } else {
        progressPct = 50;
      }
    }

    const actualGrams = round1((totalFilamentUsedGrams * progressPct) / 100);
    const targetSpool = state.spools.find(s => Number(s.slot) === Number(slotUsed)) || state.spools[0];
    const spoolId = targetSpool ? targetSpool.id : "";

    if (targetSpool && actualGrams > 0) {
      targetSpool.remainingWeight = Math.max(0, round1(Number(targetSpool.remainingWeight || 0) - actualGrams));
      newlyDeductedBySpool[targetSpool.id] = round1((newlyDeductedBySpool[targetSpool.id] || 0) + actualGrams);
    }

    const printTimestamp = endTimeSec > 0 ? endTimeSec * 1000 : Date.now();
    state.prints.unshift({
      id: "print-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      cloudTaskId: cloudId,
      filename: baseFilename,
      status: taskStatus,
      spoolId,
      totalEstimatedGrams: round1(totalFilamentUsedGrams),
      progressPct,
      actualGrams,
      gramsDeducted: true,
      estimatedFromTime: isEstimatedFromTime,
      timestamp: printTimestamp
    });
    changed = true;
  }

  if (changed) {
    state.prints.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    state.isBackgroundSync = true;
    state.baseUpdatedAt = baseUpdatedAt;
    state.newlyDeductedBySpool = newlyDeductedBySpool;
    await saveDbStateForAccount(env, accountKey, state);
  }

  return { synced: true, changed };
}

const ALLOWED_READONLY_ENDPOINTS = [
  "/api/v1/device-management-server/device/list",
  "/api/v1/device-management-server/device/report-data/list",
  "/api/v1/device-management-server/local-file/page",
  "/api/v1/device-management-server/local-file/filename",
  "/api/v1/device-management-server/device/event-data/page",
  "/api/v1/account-center-server/account-info/account"
];

function isEndpointAllowed(endpoint) {
  const clean = String(endpoint || "").split("?")[0].trim();
  return ALLOWED_READONLY_ENDPOINTS.includes(clean);
}

function withSecurityHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("X-Frame-Options", "DENY");
  newHeaders.set("X-Content-Type-Options", "nosniff");
  newHeaders.set("Referrer-Policy", "no-referrer");
  newHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type, X-Account-Key, X-Elegoo-Token");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

function sanitizeStateForClient(state) {
  if (!state || typeof state !== "object") return state;
  const clone = structuredClone(state);
  if (clone.auth && typeof clone.auth === "object") {
    delete clone.auth.passwordHash;
    delete clone.auth.passwordSalt;
  }
  return clone;
}

async function verifyTokenBelongsToAccount(region, reqToken, existingState) {
  if (!reqToken) return { authorized: false, isNewLiveToken: false, user: null };
  if (!existingState || !existingState.auth) return { authorized: true, isNewLiveToken: false, user: null };
  if (existingState.auth.token === reqToken) {
    return { authorized: true, isNewLiveToken: false, user: existingState.auth.user || null };
  }
  if (Array.isArray(existingState.validTokens) && existingState.validTokens.includes(reqToken)) {
    return { authorized: true, isNewLiveToken: false, user: existingState.auth.user || null };
  }

  // Verify fresh token directly against Elegoo Cloud Account Center
  try {
    const prof = await matrixFetch(region || existingState.auth.region || "intl", reqToken, "/api/v1/account-center-server/account-info/account", "GET");
    if (prof && (prof.code === 0 || prof.code === 200) && prof.data && prof.data.id) {
      const profEmail = String(prof.data.email || "").trim().toLowerCase();
      const profId = String(prof.data.id || "").trim().toLowerCase();
      const storedEmail = String(existingState.auth.email || existingState.auth.user?.email || "").trim().toLowerCase();
      const storedId = String(existingState.auth.user?.id || "").trim().toLowerCase();
      if ((profEmail && profEmail === storedEmail) || (profId && profId === storedId)) {
        return { authorized: true, isNewLiveToken: true, user: prof.data };
      }
    }
  } catch {}
  return { authorized: false, isNewLiveToken: false, user: null };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return withSecurityHeaders(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);

    // 1. GET /api/info
    if (url.pathname === "/api/info" && request.method === "GET") {
      return withSecurityHeaders(Response.json({
        port: 443,
        lanIps: [url.host]
      }));
    }

    // 2. GET / POST /api/data (isolated per Elegoo user account & cryptographically verified)
    if (url.pathname === "/api/data") {
      const accountParam =
        url.searchParams.get("account") ||
        request.headers.get("X-Account-Key") ||
        "";
      const reqToken = String(request.headers.get("X-Elegoo-Token") || "").trim();

      if (request.method === "GET") {
        if (!reqToken) {
          return withSecurityHeaders(Response.json({ empty: true }, { status: 401 }));
        }
        const state = await getDbStateForAccount(env, accountParam || reqToken);
        if (!state) return withSecurityHeaders(Response.json({ empty: true }));

        const authCheck = await verifyTokenBelongsToAccount(state.auth?.region || "intl", reqToken, state);
        if (!authCheck.authorized) {
          return withSecurityHeaders(Response.json({ empty: true }, { status: 403 }));
        }

        const slotsFixed = ensureFourCanvasSlotsExist(state);
        const reconciled = reconcileExistingPrintsAndSpools(state);

        // Only update state.auth.token if reqToken is a brand-new live token verified on Elegoo Cloud;
        // never overwrite a newer active token with an older one from validTokens.
        const shouldAdoptNewToken = authCheck.isNewLiveToken && state.auth && state.auth.token !== reqToken;
        if (shouldAdoptNewToken || slotsFixed || reconciled) {
          if (shouldAdoptNewToken) {
            state.auth.token = reqToken;
            if (authCheck.user) state.auth.user = authCheck.user;
            state.validTokens = Array.from(new Set([...(state.validTokens || []), reqToken])).slice(-10);
          }
          await saveDbStateForAccount(env, accountParam || reqToken, state);
        }

        return withSecurityHeaders(Response.json(sanitizeStateForClient(state)));
      }

      if (request.method === "POST") {
        const body = await request.json();
        const tokenToSave = String(reqToken || body?.auth?.token || "").trim();
        if (!tokenToSave) {
          return withSecurityHeaders(Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }));
        }
        const key = resolveCanonicalAccountKey(accountParam || body?.accountKey, body) || tokenToSave;
        let existing = await getDbStateForAccount(env, key);
        if (!existing && accountParam && normalizeAccountKey(accountParam) !== key) {
          existing = await getDbStateForAccount(env, accountParam);
        }

        if (existing) {
          const authCheck = await verifyTokenBelongsToAccount(body?.auth?.region || existing.auth?.region || "intl", tokenToSave, existing);
          if (!authCheck.authorized) {
            return withSecurityHeaders(Response.json({ ok: false, error: "Forbidden" }, { status: 403 }));
          }
          // Prevent a client with an older cached token from downgrading the active token stored on Cloudflare
          if (!authCheck.isNewLiveToken && existing.auth?.token && existing.auth.token !== tokenToSave) {
            body.auth = body.auth || {};
            body.auth.token = existing.auth.token;
          }
          body.validTokens = Array.from(new Set([...(existing.validTokens || []), tokenToSave, body.auth?.token].filter(Boolean))).slice(-10);
        } else {
          body.validTokens = [tokenToSave];
        }

        await saveDbStateForAccount(env, key, body);
        return withSecurityHeaders(Response.json({ ok: true, activeToken: body.auth?.token || tokenToSave }));
      }
    }

    // 3. POST /api/cloud/login (Smart Login reusing active session + Official Elegoo RSA + AES-256-CBC + Token Login)
    if (url.pathname === "/api/cloud/login" && request.method === "POST") {
      try {
        const reqData = await request.json();
        const email = String(reqData.email || "").trim();
        const password = String(reqData.password || "").trim();
        const manualToken = String(reqData.token || (/^[a-f0-9]{32}$/i.test(password) ? password : "")).trim();
        const region = reqData.region || "intl";
        const baseUrl = getMatrixBaseUrl(region);
        const reqHost = url.hostname;
        const isLocalReq = reqHost === "localhost" || reqHost === "127.0.0.1";

        if (!manualToken && !isLocalReq) {
          return withSecurityHeaders(Response.json({
            ok: false,
            error: "Accesso tramite email/password disabilitato sulla Web App. Scansiona il Codice QR dall'app PC."
          }, { status: 403 }));
        }

        // Allow pasting / syncing a 32-char Elegoo Cloud token directly (e.g. from Elegoo Slicer Bridge)
        if (/^[a-f0-9]{32}$/i.test(manualToken)) {
          const prof = await matrixFetch(region, manualToken, "/api/v1/account-center-server/account-info/account", "GET");
          if (prof && (prof.code === 0 || prof.code === 200) && prof.data && prof.data.id) {
            const accKey = prof.data.email || email || prof.data.id;
            const existing = await getDbStateForAccount(env, accKey);
            if (existing) {
              existing.auth = existing.auth || {};
              existing.auth.token = manualToken;
              existing.auth.region = region;
              existing.auth.email = prof.data.email || existing.auth.email || email;
              existing.auth.user = prof.data;
              existing.auth.loggedIn = true;
              existing.validTokens = Array.from(new Set([...(existing.validTokens || []), manualToken])).slice(-10);
              await saveDbStateForAccount(env, accKey, existing);
            } else {
              await saveDbStateForAccount(env, accKey, {
                accountKey: normalizeAccountKey(accKey),
                auth: {
                  loggedIn: true,
                  region,
                  email: prof.data.email || email,
                  token: manualToken,
                  refreshToken: "",
                  user: prof.data
                },
                spools: [],
                prints: [],
                fileMetaCache: {},
                liveSnapshotsByFile: {},
                ignoredCloudTaskIds: [...DEFAULT_IGNORED_OLD_TASK_IDS],
                manuallyDeletedTaskIds: [],
                validTokens: [manualToken],
                subscription: { tier: "free", active: true }
              });
            }
            return withSecurityHeaders(Response.json({
              ok: true,
              region,
              token: manualToken,
              refreshToken: "",
              user: prof.data,
              reusedSession: true
            }));
          }
        }

        // Smart Login: check if we already hold a valid active Elegoo token AND password matches stored PBKDF2 hash.
        // Reusing the active token avoids generating a new token that would disconnect Elegoo Slicer on PC.
        if (email && password) {
          const existing = await getDbStateForAccount(env, email);
          if (existing?.auth?.token && existing?.auth?.passwordHash && existing?.auth?.passwordSalt) {
            const passOk = await verifyPasswordPBKDF2(password, existing.auth.passwordSalt, existing.auth.passwordHash);
            if (passOk) {
              try {
                const prof = await matrixFetch(region, existing.auth.token, "/api/v1/account-center-server/account-info/account", "GET");
                if (prof && (prof.code === 0 || prof.code === 200) && prof.data && prof.data.id) {
                  existing.auth.user = prof.data;
                  existing.auth.region = region;
                  existing.auth.loggedIn = true;
                  await saveDbStateForAccount(env, email, existing);
                  return withSecurityHeaders(Response.json({
                    ok: true,
                    region,
                    token: existing.auth.token,
                    refreshToken: existing.auth.refreshToken || "",
                    user: prof.data,
                    reusedSession: true
                  }));
                }
              } catch {}
            }
          }
        }

        // Official Elegoo Account Center RSA + AES-256-CBC handshake (used only if no live session exists)
        try {
          const keyResp = await fetch(`${baseUrl}/api/v1/account-center-server/account-auth/key`, {
            method: "POST",
            headers: getMatrixHeaders(""),
            body: JSON.stringify({ clientId: "Slicer" })
          });
          const keyData = await keyResp.json();
          const pubKey = keyData?.data?.publicKey || keyData?.publicKey || "";

          if (pubKey) {
            const aesKeyPlain = randomString("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 32);
            const aesIvPlain = randomString("0123456789", 16);

            const encPassword = await aesEncryptBase64(password, aesKeyPlain, aesIvPlain);
            const encAesKey = rsaEncryptSpkiBase64(aesKeyPlain, pubKey);
            const encAesIv = rsaEncryptSpkiBase64(aesIvPlain, pubKey);

            const loginResp = await fetch(`${baseUrl}/api/v1/account-center-server/account-auth/login/email/password`, {
              method: "POST",
              headers: getMatrixHeaders(""),
              body: JSON.stringify({
                clientId: "Slicer",
                email,
                password: encPassword,
                aesKey: encAesKey,
                aesIv: encAesIv
              })
            });
            const loginObj = await loginResp.json();
            const token = loginObj?.data?.token || loginObj?.data?.accessToken || "";
            if (token) {
              let userObj = { email };
              try {
                const prof = await matrixFetch(region, token, "/api/v1/account-center-server/account-info/account", "GET");
                if (prof && prof.data && prof.data.id) userObj = prof.data;
              } catch {}

              const { saltHex, hashHex } = await hashPasswordPBKDF2(password);
              const accKey = userObj.email || email || userObj.id;
              const existing = await getDbStateForAccount(env, accKey);
              if (existing) {
                existing.auth = existing.auth || {};
                existing.auth.token = token;
                if (loginObj?.data?.refreshToken) existing.auth.refreshToken = loginObj.data.refreshToken;
                existing.auth.region = region;
                existing.auth.email = userObj.email || email;
                existing.auth.user = userObj;
                existing.auth.loggedIn = true;
                existing.auth.passwordSalt = saltHex;
                existing.auth.passwordHash = hashHex;
                existing.validTokens = Array.from(new Set([...(existing.validTokens || []), token])).slice(-10);
                await saveDbStateForAccount(env, accKey, existing);
              } else {
                await saveDbStateForAccount(env, accKey, {
                  accountKey: normalizeAccountKey(accKey),
                  auth: {
                    loggedIn: true,
                    region,
                    email: userObj.email || email,
                    token,
                    refreshToken: loginObj?.data?.refreshToken || "",
                    user: userObj,
                    passwordSalt: saltHex,
                    passwordHash: hashHex
                  },
                  spools: [],
                  prints: [],
                  fileMetaCache: {},
                  liveSnapshotsByFile: {},
                  ignoredCloudTaskIds: [...DEFAULT_IGNORED_OLD_TASK_IDS],
                  manuallyDeletedTaskIds: [],
                  validTokens: [token],
                  subscription: { tier: "free", active: true }
                });
              }

              return withSecurityHeaders(Response.json({
                ok: true,
                region,
                token,
                refreshToken: loginObj?.data?.refreshToken || "",
                user: userObj,
                reusedSession: false
              }));
            }
          }
        } catch (cryptoErr) {
          console.warn("RSA/AES login error:", cryptoErr);
        }

        return withSecurityHeaders(Response.json({
          ok: false,
          error: "Credenziali non valide. Se hai creato l'account Elegoo con 'Accedi con Google', usa il tuo Token Cloud o la scheda Elegoo Slicer (PC)."
        }));
      } catch (err) {
        return withSecurityHeaders(Response.json({ ok: false, error: err.message || String(err) }, { status: 500 }));
      }
    }

    // 4. POST /api/cloud/proxy (Strictly restricted to read-only GET endpoints on whitelist, with token self-healing)
    if (url.pathname === "/api/cloud/proxy" && request.method === "POST") {
      try {
        const reqData = await request.json();
        const region = reqData.region || "intl";
        const reqToken = String(reqData.token || "").trim();
        const endpoint = reqData.endpoint || "";
        const accountKey = normalizeAccountKey(reqData.accountKey || "");

        if (!reqToken) {
          return withSecurityHeaders(Response.json({ code: 401, msg: "Missing token" }, { status: 401 }));
        }
        if (!isEndpointAllowed(endpoint)) {
          return withSecurityHeaders(Response.json({ code: 403, msg: "Endpoint non consentito (solo lettura)" }, { status: 403 }));
        }

        let activeToken = reqToken;
        let swappedToken = "";
        let existingState = null;

        if (accountKey) {
          existingState = await getDbStateForAccount(env, accountKey);
          if (
            existingState?.auth?.token &&
            existingState.auth.token !== reqToken &&
            Array.isArray(existingState.validTokens) &&
            existingState.validTokens.includes(reqToken)
          ) {
            activeToken = existingState.auth.token;
            swappedToken = activeToken;
          }
        }

        let data = await matrixFetch(region, activeToken, endpoint, "GET", null);

        // If Elegoo rejected the client's token with 401, check whether a newer token exists for this verified account
        if (data && (data.code === 401 || data.code === "401") && !swappedToken) {
          if (!existingState) {
            existingState = await getDbStateForAccount(env, accountKey || reqToken);
          }
          if (
            existingState?.auth?.token &&
            existingState.auth.token !== reqToken &&
            Array.isArray(existingState.validTokens) &&
            existingState.validTokens.includes(reqToken)
          ) {
            const retried = await matrixFetch(region, existingState.auth.token, endpoint, "GET", null);
            if (retried && retried.code !== 401 && retried.code !== "401") {
              data = retried;
              swappedToken = existingState.auth.token;
            }
          }
        }

        if (swappedToken && data && typeof data === "object") {
          data._refreshedToken = swappedToken;
        }

        return withSecurityHeaders(Response.json(data));
      } catch (err) {
        return withSecurityHeaders(Response.json({ code: 500, msg: err.message || String(err) }, { status: 500 }));
      }
    }

    // 5. Fallback to static files in ./public
    const assetResp = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResp);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const accounts = await getAllAccountKeys(env);
      const processedCanonical = new Set();
      for (const accountKey of accounts) {
        try {
          const state = await getDbStateForAccount(env, accountKey);
          const canonical = state ? resolveCanonicalAccountKey(accountKey, state) : normalizeAccountKey(accountKey);
          if (!canonical || processedCanonical.has(canonical)) continue;
          processedCanonical.add(canonical);
          await syncAccountWithElegooCloud(env, canonical);
        } catch {}
      }
    })());
  }
};
