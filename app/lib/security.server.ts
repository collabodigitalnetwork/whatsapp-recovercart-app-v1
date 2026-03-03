/**
 * Security utilities and middleware for production deployment
 * Implements OWASP security best practices
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { logger } from "./logger.server";

/**
 * Security headers configuration
 */
export const securityHeaders = {
  // Prevent clickjacking
  "X-Frame-Options": "SAMEORIGIN",
  
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  
  // XSS protection
  "X-XSS-Protection": "1; mode=block",
  
  // Referrer policy
  "Referrer-Policy": "strict-origin-when-cross-origin",
  
  // Permissions policy (formerly feature policy)
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  
  // Strict Transport Security (HSTS)
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  
  // Content Security Policy
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.shopify.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://cdn.shopify.com",
    "connect-src 'self' wss: https:",
    "frame-src 'self' https://admin.shopify.com https://*.myshopify.com",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; "),
};

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

export const rateLimitConfigs = {
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    skipSuccessfulRequests: false,
  },
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,
    skipSuccessfulRequests: true,
  },
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    skipSuccessfulRequests: true,
  },
  webhooks: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 1000, // Shopify can send many webhooks
    skipSuccessfulRequests: true,
  },
};

/**
 * Input validation and sanitization
 */
export class InputValidator {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  static isValidShopDomain(domain: string): boolean {
    const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\.myshopify\.com$/;
    return shopifyDomainRegex.test(domain) && domain.length <= 100;
  }

  static isValidPhoneNumber(phone: string): boolean {
    // E.164 format validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (typeof input !== "string") {
      throw new Error("Input must be a string");
    }
    
    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
  }

  static validateAndSanitizeId(id: string): string {
    if (!id || typeof id !== "string") {
      throw new Error("Invalid ID format");
    }
    
    // Check if it's a valid CUID or UUID
    const cuidRegex = /^c[0-9a-z]{24}$/i;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!cuidRegex.test(id) && !uuidRegex.test(id)) {
      throw new Error("Invalid ID format");
    }
    
    return id;
  }
}

/**
 * Cryptographic utilities
 */
export class CryptoUtils {
  static generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString("hex");
  }

  static hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const saltToUse = salt || randomBytes(16).toString("hex");
    const hash = createHash("pbkdf2")
      .update(password)
      .update(saltToUse)
      .digest("hex");
    
    return { hash, salt: saltToUse };
  }

  static verifyPassword(password: string, hash: string, salt: string): boolean {
    const { hash: newHash } = this.hashPassword(password, salt);
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(newHash, "hex"));
  }

  static generateHmacSignature(data: string, secret: string): string {
    return createHash("sha256")
      .update(data)
      .update(secret)
      .digest("hex");
  }

  static verifyHmacSignature(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateHmacSignature(data, secret);
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }
}

/**
 * Security audit logger
 */
export class SecurityAudit {
  static logSecurityEvent(event: {
    type: "auth_failure" | "rate_limit" | "invalid_input" | "suspicious_activity";
    userId?: string;
    ip?: string;
    userAgent?: string;
    details?: Record<string, any>;
  }): void {
    logger.warn("Security event", {
      ...event,
      timestamp: new Date().toISOString(),
      severity: this.getSeverity(event.type),
    });
  }

  static logAuthEvent(event: {
    type: "login" | "logout" | "token_refresh" | "permission_denied";
    userId: string;
    ip?: string;
    userAgent?: string;
    success: boolean;
    details?: Record<string, any>;
  }): void {
    const logLevel = event.success ? "info" : "warn";
    logger[logLevel]("Authentication event", {
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  static logDataAccess(event: {
    userId: string;
    resource: string;
    action: "read" | "write" | "delete";
    sensitive?: boolean;
    ip?: string;
  }): void {
    if (event.sensitive) {
      logger.info("Sensitive data access", {
        ...event,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private static getSeverity(type: string): "low" | "medium" | "high" | "critical" {
    switch (type) {
      case "auth_failure":
        return "medium";
      case "rate_limit":
        return "medium";
      case "invalid_input":
        return "low";
      case "suspicious_activity":
        return "high";
      default:
        return "low";
    }
  }
}

/**
 * Request validation middleware
 */
export function validateRequest(options: {
  maxBodySize?: number;
  allowedMethods?: string[];
  requireAuth?: boolean;
}) {
  return (req: any, res: any, next: any) => {
    try {
      // Validate HTTP method
      if (options.allowedMethods && !options.allowedMethods.includes(req.method)) {
        SecurityAudit.logSecurityEvent({
          type: "invalid_input",
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          details: { invalidMethod: req.method, path: req.path },
        });
        return res.status(405).json({ error: "Method not allowed" });
      }

      // Validate body size
      if (options.maxBodySize && req.get("content-length")) {
        const contentLength = parseInt(req.get("content-length"), 10);
        if (contentLength > options.maxBodySize) {
          SecurityAudit.logSecurityEvent({
            type: "invalid_input",
            ip: req.ip,
            userAgent: req.get("User-Agent"),
            details: { oversizedRequest: contentLength, limit: options.maxBodySize },
          });
          return res.status(413).json({ error: "Payload too large" });
        }
      }

      // Validate required authentication
      if (options.requireAuth && !req.user) {
        SecurityAudit.logSecurityEvent({
          type: "auth_failure",
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          details: { path: req.path, reason: "missing_auth" },
        });
        return res.status(401).json({ error: "Authentication required" });
      }

      next();
    } catch (error) {
      logger.error("Request validation error", { error, path: req.path });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Shopify webhook signature verification
 */
export function verifyShopifyWebhook(body: string, signature: string): boolean {
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("SHOPIFY_WEBHOOK_SECRET not configured");
  }

  const expectedSignature = CryptoUtils.generateHmacSignature(body, webhookSecret);
  const providedSignature = signature.replace("sha256=", "");

  return CryptoUtils.verifyHmacSignature(body, providedSignature, webhookSecret);
}

/**
 * CORS configuration for Shopify
 */
export const corsConfig = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Shopify admin and partner origins
    const allowedOrigins = [
      "https://admin.shopify.com",
      "https://partners.shopify.com",
      /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/,
    ];

    // Development origins
    if (process.env.NODE_ENV === "development") {
      allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
    }

    // Production app domain
    if (process.env.APP_URL) {
      allowedOrigins.push(process.env.APP_URL);
    }

    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") {
        return origin === allowed;
      }
      return allowed.test(origin);
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      SecurityAudit.logSecurityEvent({
        type: "suspicious_activity",
        details: { blockedOrigin: origin, reason: "cors_violation" },
      });
      callback(new Error("CORS policy violation"), false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Shopify-Topic",
    "X-Shopify-Hmac-Sha256",
    "X-Shopify-Shop-Domain",
    "X-Shopify-API-Request-Failure-Reauthorize",
    "X-Shopify-API-Request-Failure-Reauthorize-Url",
  ],
};

/**
 * Production security configuration checker
 */
export function validateProductionSecurity(): string[] {
  const issues: string[] = [];

  // Check required environment variables
  const requiredSecrets = [
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_WEBHOOK_SECRET",
  ];

  for (const secret of requiredSecrets) {
    if (!process.env[secret]) {
      issues.push(`Missing required secret: ${secret}`);
    } else if (process.env[secret].length < 32) {
      issues.push(`Secret ${secret} is too short (minimum 32 characters)`);
    }
  }

  // Check NODE_ENV
  if (process.env.NODE_ENV !== "production") {
    issues.push("NODE_ENV is not set to 'production'");
  }

  // Check HTTPS requirement
  if (!process.env.APP_URL?.startsWith("https://")) {
    issues.push("APP_URL must use HTTPS in production");
  }

  return issues;
}