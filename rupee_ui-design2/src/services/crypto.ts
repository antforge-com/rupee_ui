// ─────────────────────────────────────────────────────────────────────────────
// crypto.ts  —  Password encryption utility (AES-256-CBC via Web Crypto API)
//
// Why AES and NOT RSA:
//   The backend uses BCryptPasswordEncoder. BCrypt is a one-way hash and
//   Spring Security calls passwordEncoder.matches(plainText, storedHash).
//   It MUST receive the decrypted plain text. So the flow is:
//     Frontend  →  AES-encrypt(password)  →  HTTP POST
//     Backend   →  AES-decrypt(payload)   →  BCrypt.matches(plain, hash) ✅
//
// The shared AES key must also be added to Spring Boot application.properties:
//   app.encryption.secret-key=M33tTh3M4st3rs@2026SecureKey!!32
//   (exactly 32 UTF-8 chars = 256-bit AES key)
//
// See the BACKEND INTEGRATION NOTE at the bottom of this file for the Java
// PasswordDecryptionUtil class your backend team needs to add.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared secret — MUST match app.encryption.secret-key in application.properties ──
const AES_SECRET_KEY = "M33tTh3M4st3rs@2026SecureKey!!32"; // exactly 32 chars

// ── Helpers ──────────────────────────────────────────────────────────────────

const strToBytes = (str: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(str);
  return new Uint8Array(encoded.buffer.slice(0) as ArrayBuffer);
};

const bytesToB64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

// ── Key import (cached for the session) ──────────────────────────────────────
let _cachedKey: CryptoKey | null = null;

const importAesKey = async (): Promise<CryptoKey> => {
  if (_cachedKey) return _cachedKey;
  const keyBytes = strToBytes(AES_SECRET_KEY).slice(0, 32);
  _cachedKey = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  return _cachedKey;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypts a plain-text password with AES-256-CBC.
 * Returns a Base64 string formatted as:  <IV_base64>:<ciphertext_base64>
 *
 * The backend splits on ":" to extract IV + ciphertext, decrypts with the
 * same key, then passes the plain text to BCrypt.
 *
 * Graceful fallback: returns the original plain text if Web Crypto is
 * unavailable (non-HTTPS context) or any error occurs, so login never breaks.
 */
export const encryptPassword = async (plainText: string): Promise<string> => {
  if (!plainText) return plainText;

  if (typeof window === "undefined" || !window?.crypto?.subtle) {
    console.warn("[crypto] Web Crypto unavailable — sending plain text");
    return plainText;
  }

  try {
    const key = await importAesKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      key,
      strToBytes(plainText)
    );
    return `${bytesToB64(iv)}:${bytesToB64(new Uint8Array(encrypted))}`;
  } catch (err) {
    console.warn("[crypto] Encryption failed, falling back to plain text:", err);
    return plainText;
  }
};

/**
 * Pre-warms the AES key so it is cached before the user hits submit.
 * Call this once inside useEffect on the Login / Register page mount.
 */
export const prewarmCrypto = (): void => {
  importAesKey().catch(() => {});
};

// ─────────────────────────────────────────────────────────────────────────────
// SYNCHRONOUS localStorage OBFUSCATION
// Prevents role / identifier from being readable as plain text in DevTools.
// Uses XOR against the shared secret + Base64 encoding.
// Gracefully falls back to the raw value so existing sessions don't break.
// ─────────────────────────────────────────────────────────────────────────────

const _xor = (str: string, key: string): string =>
  str
    .split("")
    .map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    )
    .join("");

/**
 * Obfuscate a string for safe localStorage storage.
 * Returns the original value unchanged on any error.
 */
export const encryptLocal = (value: string): string => {
  if (!value) return value;
  try {
    return "enc:" + btoa(_xor(value, AES_SECRET_KEY));
  } catch {
    return value;
  }
};

/**
 * Reverse of encryptLocal.  Handles both obfuscated ("enc:…") and legacy
 * plain-text values so existing sessions are not broken after a deploy.
 */
export const decryptLocal = (stored: string): string => {
  if (!stored) return stored;
  if (!stored.startsWith("enc:")) return stored; // legacy plain-text — pass through
  try {
    return _xor(atob(stored.slice(4)), AES_SECRET_KEY);
  } catch {
    return stored;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND INTEGRATION — share this with your backend team
// ─────────────────────────────────────────────────────────────────────────────
//
// 1) application.properties  (add this line)
//    app.encryption.secret-key=M33tTh3M4st3rs@2026SecureKey!!32
//
// 2) Create  src/main/java/com/rupee/util/PasswordDecryptionUtil.java :
//
//    package com.rupee.util;
//    import org.springframework.beans.factory.annotation.Value;
//    import org.springframework.stereotype.Component;
//    import javax.crypto.Cipher;
//    import javax.crypto.spec.IvParameterSpec;
//    import javax.crypto.spec.SecretKeySpec;
//    import java.nio.charset.StandardCharsets;
//    import java.util.Base64;
//
//    @Component
//    public class PasswordDecryptionUtil {
//
//        @Value("${app.encryption.secret-key}")
//        private String secretKey;
//
//        /**
//         * Decrypts an AES-256-CBC encrypted payload from the frontend.
//         * Expected format:  <IV_base64>:<ciphertext_base64>
//         * Returns the original string unchanged if it is not in that format
//         * (graceful fallback for plain-text passwords).
//         */
//        public String decrypt(String payload) {
//            if (payload == null || !payload.contains(":")) return payload;
//            try {
//                String[] parts = payload.split(":", 2);
//                byte[] iv  = Base64.getDecoder().decode(parts[0]);
//                byte[] ct  = Base64.getDecoder().decode(parts[1]);
//                SecretKeySpec keySpec = new SecretKeySpec(
//                    secretKey.getBytes(StandardCharsets.UTF_8), "AES");
//                Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
//                cipher.init(Cipher.DECRYPT_MODE, keySpec, new IvParameterSpec(iv));
//                return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
//            } catch (Exception e) {
//                // Not encrypted or wrong format — treat as plain text (safe fallback)
//                return payload;
//            }
//        }
//    }
//
// 3) Inject PasswordDecryptionUtil into AuthService and UserService.
//    Wherever you receive a raw password string, call:
//
//      String plain = passwordDecryptionUtil.decrypt(request.getPassword());
//
//    Then pass `plain` to:
//      - passwordEncoder.matches(plain, user.getPassword())   ← for login
//      - passwordEncoder.encode(plain)                        ← for save/update
//
//    Specifically update these methods:
//      AuthService        → authenticate()          (login check)
//      UserService        → changePassword()         (new + confirm passwords)
//      UserService        → resetPasswordWithOtp()   (newPassword)
// ─────────────────────────────────────────────────────────────────────────────