/* AI Sports — шифрование ссылок чек-ина (WebCrypto, без сервера).
   Ключ команды хранится только у врача. Для каждого спортсмена из него выводится свой ключ
   (HKDF-SHA256), который попадает в персональную ссылку после «#» — эта часть адреса не
   передаётся на сервер. Ответ спортсмена шифруется AES-256-GCM этим ключом: прочитать и
   подделать его без ключа нельзя, а ответ одного спортсмена нельзя выдать за ответ другого. */
(function (global) {
  'use strict';
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64u(bytes) {
    var s = '';
    bytes = new Uint8Array(bytes);
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('bad-encoding');
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function randomKey() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }
  function randomId(n) { return b64u(crypto.getRandomValues(new Uint8Array(n || 6))); }

  function deriveAthleteKey(teamKey, teamId, athleteId) {
    return crypto.subtle.importKey('raw', unb64u(teamKey), 'HKDF', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('asp-team:' + teamId), info: enc.encode('asp-checkin-v1:' + athleteId) }, k, 256);
    }).then(function (bits) { return b64u(bits); });
  }
  function aesKey(rawB64u, usage) {
    return crypto.subtle.importKey('raw', unb64u(rawB64u), { name: 'AES-GCM' }, false, [usage]);
  }
  function seal(rawKey, obj, aad) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return aesKey(rawKey, 'encrypt').then(function (k) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad) }, k, enc.encode(JSON.stringify(obj)));
    }).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0); out.set(new Uint8Array(ct), 12);
      return b64u(out);
    });
  }
  function open(rawKey, blob, aad) {
    var all = unb64u(blob);
    if (all.length < 29) return Promise.reject(new Error('too-short'));
    return aesKey(rawKey, 'decrypt').then(function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: enc.encode(aad) }, k, all.slice(12));
    }).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }

  /* Ссылка-приглашение: checkin#v1.<teamId>.<athleteId>.<athleteKey>.<имя> */
  function parseInvite(hash) {
    var p = String(hash || '').replace(/^#/, '').split('.');
    if (p.length < 4 || p[0] !== 'v1') return null;
    var name = '';
    try { name = p[4] ? dec.decode(unb64u(p[4])) : ''; } catch (e) { name = ''; }
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(p[1]) || !/^[A-Za-z0-9_-]{2,40}$/.test(p[2]) || !/^[A-Za-z0-9_-]{43}$/.test(p[3])) return null;
    return { teamId: p[1], athleteId: p[2], key: p[3], name: name.slice(0, 60) };
  }
  function inviteHash(teamId, athleteId, key, name) {
    return 'v1.' + teamId + '.' + athleteId + '.' + key + '.' + b64u(enc.encode(String(name || '').slice(0, 60)));
  }
  /* Ответ: app#ci=<teamId>.<athleteId>.<шифротекст> */
  function parseReply(text) {
    var m = /ci=([A-Za-z0-9_-]{4,40})\.([A-Za-z0-9_-]{2,40})\.([A-Za-z0-9_-]{40,4000})/.exec(String(text || ''));
    return m ? { teamId: m[1], athleteId: m[2], blob: m[3] } : null;
  }
  function parseReplies(text) {
    var out = [], re = /ci=([A-Za-z0-9_-]{4,40})\.([A-Za-z0-9_-]{2,40})\.([A-Za-z0-9_-]{40,4000})/g, m;
    while ((m = re.exec(String(text || ''))) && out.length < 500) out.push({ teamId: m[1], athleteId: m[2], blob: m[3] });
    return out;
  }
  function aadFor(teamId, athleteId) { return 'asp-checkin-v1|' + teamId + '|' + athleteId; }

  global.ASPCrypto = {
    b64u: b64u, unb64u: unb64u, randomKey: randomKey, randomId: randomId,
    deriveAthleteKey: deriveAthleteKey, seal: seal, open: open, aadFor: aadFor,
    parseInvite: parseInvite, inviteHash: inviteHash, parseReply: parseReply, parseReplies: parseReplies
  };
})(typeof window !== 'undefined' ? window : globalThis);
