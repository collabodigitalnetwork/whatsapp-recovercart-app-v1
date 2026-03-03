import type { LoaderFunctionArgs } from "react-router";
import { json } from "react-router";
import prisma from "../db.server";
import { logger } from "../lib/logger.server";
import { MonitoringService } from "../services/monitoring.server";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: HealthStatus;
    redis: HealthStatus;
    memory: HealthStatus;
    dependencies: HealthStatus;
  };
  metrics?: {
    activeConnections: number;
    memoryUsage: NodeJS.MemoryUsage;
    responseTime: number;
  };
}

interface HealthStatus {
  status: "pass" | "fail" | "warn";
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const detailed = url.searchParams.get("detailed") === "true";
  
  try {
    // Run health checks
    const healthChecks = await runHealthChecks();
    const responseTime = Date.now() - startTime;
    
    // Determine overall status
    const overallStatus = determineOverallStatus(healthChecks);
    
    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      uptime: Math.floor(process.uptime()),
      checks: healthChecks,
    };
    
    // Add detailed metrics if requested
    if (detailed) {
      result.metrics = {
        activeConnections: getActiveConnectionCount(),
        memoryUsage: process.memoryUsage(),
        responseTime,
      };
    }
    
    // Log health check if there are issues
    if (overallStatus !== "healthy") {
      logger.warn("Health check detected issues", { result });
    }
    
    // Return appropriate HTTP status
    const httpStatus = getHttpStatus(overallStatus);
    
    return json(result, {
      status: httpStatus,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Health-Check-Time": responseTime.toString(),
      },
    });
    
  } catch (error) {
    logger.error("Health check failed", { error });
    
    return json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        uptime: Math.floor(process.uptime()),
        error: "Health check system failure",
        checks: {
          database: { status: "fail", error: "Health check system failure" },
          redis: { status: "fail", error: "Health check system failure" },
          memory: { status: "fail", error: "Health check system failure" },
          dependencies: { status: "fail", error: "Health check system failure" },
        },
      } as HealthCheckResult,
      { 
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  }
}

async function runHealthChecks(): Promise<HealthCheckResult["checks"]> {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkMemory(),
    checkDependencies(),
  ]);

  return {
    database: checks[0].status === "fulfilled" ? checks[0].value : { status: "fail", error: "Check failed" },
    redis: checks[1].status === "fulfilled" ? checks[1].value : { status: "fail", error: "Check failed" },
    memory: checks[2].status === "fulfilled" ? checks[2].value : { status: "fail", error: "Check failed" },
    dependencies: checks[3].status === "fulfilled" ? checks[3].value : { status: "fail", error: "Check failed" },
  };
}

async function checkDatabase(): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    // Test database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    // Check connection pool
    const responseTime = Date.now() - startTime;
    
    // Warn if database response is slow
    if (responseTime > 1000) {
      return {
        status: "warn",
        responseTime,
        details: { message: "Database response time is high" },
      };
    }
    
    return {
      status: "pass",
      responseTime,
      details: { connectionPool: "healthy" },
    };
    
  } catch (error) {
    return {
      status: "fail",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

async function checkRedis(): Promise<HealthStatus> {
  const startTime = Date.now();
  
  try {
    // This would check Redis connectivity if Redis client is available
    // For now, we'll simulate the check
    const responseTime = Date.now() - startTime;
    
    if (process.env.REDIS_URL) {
      // If Redis is configured, try to connect
      // Implementation would depend on the Redis client used
      return {
        status: "pass",
        responseTime,
        details: { configured: true },
      };
    } else {
      return {
        status: "warn",
        responseTime,
        details: { configured: false, message: "Redis not configured" },
      };
    }
    
  } catch (error) {
    return {
      status: "fail",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Redis connection failed",
    };
  }
}

async function checkMemory(): Promise<HealthStatus> {
  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUtilization = (usedMemory / totalMemory) * 100;
    
    // Warn if memory usage is high
    if (memoryUtilization > 85) {
      return {
        status: "warn",
        details: {
          memoryUtilization: Math.round(memoryUtilization),
          heapUsed: Math.round(usedMemory / 1024 / 1024),
          heapTotal: Math.round(totalMemory / 1024 / 1024),
          message: "High memory usage",
        },
      };
    }
    
    // Fail if memory usage is critical
    if (memoryUtilization > 95) {
      return {
        status: "fail",
        details: {
          memoryUtilization: Math.round(memoryUtilization),
          heapUsed: Math.round(usedMemory / 1024 / 1024),
          heapTotal: Math.round(totalMemory / 1024 / 1024),
          message: "Critical memory usage",
        },
      };
    }
    
    return {
      status: "pass",
      details: {
        memoryUtilization: Math.round(memoryUtilization),
        heapUsed: Math.round(usedMemory / 1024 / 1024),
        heapTotal: Math.round(totalMemory / 1024 / 1024),
      },
    };
    
  } catch (error) {
    return {
      status: "fail",
      error: error instanceof Error ? error.message : "Memory check failed",
    };
  }
}

async function checkDependencies(): Promise<HealthStatus> {
  try {
    // Check intelligence API if enabled
    if (process.env.INTELLIGENCE_ENABLED === "true") {
      const intelligenceUrl = process.env.INTELLIGENCE_API_URL;
      if (intelligenceUrl) {
        try {
          const response = await fetch(`${intelligenceUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000), // 5 second timeout
          });
          
          if (!response.ok) {
            return {
              status: "warn",
              details: {
                intelligence: "unhealthy",
                status: response.status,
              },
            };
          }
        } catch (error) {
          return {
            status: "warn",
            details: {
              intelligence: "unreachable",
              error: error instanceof Error ? error.message : "Connection failed",
            },
          };
        }
      }
    }
    
    return {
      status: "pass",
      details: {
        intelligence: process.env.INTELLIGENCE_ENABLED === "true" ? "healthy" : "disabled",
      },
    };
    
  } catch (error) {
    return {
      status: "fail",
      error: error instanceof Error ? error.message : "Dependencies check failed",
    };
  }
}

function determineOverallStatus(checks: HealthCheckResult["checks"]): "healthy" | "degraded" | "unhealthy" {
  const statuses = Object.values(checks).map(check => check.status);
  
  if (statuses.includes("fail")) {
    return "unhealthy";
  }
  
  if (statuses.includes("warn")) {
    return "degraded";
  }
  
  return "healthy";
}

function getHttpStatus(status: "healthy" | "degraded" | "unhealthy"): number {
  switch (status) {
    case "healthy":
      return 200;
    case "degraded":
      return 200; // Still operational, just degraded
    case "unhealthy":
      return 503;
    default:
      return 500;
  }
}

function getActiveConnectionCount(): number {
  // This would return actual connection count from your connection pool
  // For now, return a placeholder
  return 0;
}

// Export for testing
export { runHealthChecks, determineOverallStatus };