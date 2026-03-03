import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger.server";

const algorithm = "aes-256-gcm";

/**
 * Get encryption key from environment or generate one for development
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    if (process.env.NODE_ENV === "development") {
      logger.warn("Using default encryption key for development. Set ENCRYPTION_KEY in production!");
      return Buffer.from("development_key_do_not_use_in_prod_32bytes!!", "utf-8").slice(0, 32);
    }
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  
  // Ensure the key is 32 bytes (256 bits)
  const keyBuffer = Buffer.from(key, "utf-8");
  if (keyBuffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (256 bits)");
  }
  
  return keyBuffer;
}

/**
 * Encrypt sensitive data
 * @param text - The text to encrypt
 * @returns Encrypted string in format: iv:authTag:encrypted
 */
export function encrypt(text: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag();
    
    // Return as a single string with components separated by colons
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    logger.error("Encryption failed", { error });
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt sensitive data
 * @param encryptedData - The encrypted string from encrypt()
 * @returns Decrypted text
 */
export function decrypt(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
    
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error("Invalid encrypted data format");
    }
    
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(algorithm, key, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    logger.error("Decryption failed", { error });
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Hash sensitive data for comparison (e.g., webhook verification)
 * @param data - Data to hash
 * @param salt - Optional salt
 * @returns Hashed value
 */
export function hashData(data: string, salt?: string): string {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  
  if (salt) {
    hash.update(salt);
  }
  
  hash.update(data);
  return hash.digest("hex");
}

/**
 * Generate a secure random token
 * @param length - Length of the token in bytes
 * @returns Random token as hex string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Encrypt an object (JSON)
 * @param obj - Object to encrypt
 * @returns Encrypted string
 */
export function encryptObject(obj: Record<string, any>): string {
  return encrypt(JSON.stringify(obj));
}

/**
 * Decrypt an object (JSON)
 * @param encryptedData - Encrypted string
 * @returns Decrypted object
 */
export function decryptObject(encryptedData: string): Record<string, any> {
  const decrypted = decrypt(encryptedData);
  return JSON.parse(decrypted);
}

/**
 * Mask sensitive data for logging
 * @param text - Text to mask
 * @param visibleChars - Number of characters to show at start and end
 * @returns Masked string
 */
export function maskSensitiveData(text: string, visibleChars: number = 4): string {
  if (!text || text.length <= visibleChars * 2) {
    return "****";
  }
  
  const start = text.substring(0, visibleChars);
  const end = text.substring(text.length - visibleChars);
  const maskLength = Math.max(4, text.length - visibleChars * 2);
  const mask = "*".repeat(maskLength);
  
  return `${start}${mask}${end}`;
}