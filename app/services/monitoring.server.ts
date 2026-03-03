import { logger } from "../lib/logger.server";
import { RealtimeCache } from "../lib/cache.server";
import prisma from "../db.server";

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: {
    warning: number;
    critical: number;
  };
}

interface HealthCheck {
  service: string;
  status: "healthy" | "warning" | "critical";
  responseTime: number;
  error?: string;
  timestamp: Date;
}

export class MonitoringService {
  private static metrics: Map<string, PerformanceMetric[]> = new Map();

  /**
   * Record a performance metric
   */
  static recordMetric(metric: PerformanceMetric): void {
    const key = metric.name;
    const existing = this.metrics.get(key) || [];
    
    // Keep only last 100 measurements per metric
    existing.push(metric);
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    
    this.metrics.set(key, existing);

    // Check thresholds and alert if needed
    this.checkThresholds(metric);

    // Log significant metrics
    if (metric.threshold && metric.value > metric.threshold.warning) {
      logger.warn("Performance threshold exceeded", {
        metric: metric.name,
        value: metric.value,
        unit: metric.unit,
        threshold: metric.threshold.warning,
      });
    }
  }

  /**
   * Time a function execution
   */
  static async timeFunction<T>(
    name: string,
    fn: () => Promise<T>,
    thresholds?: { warning: number; critical: number }
  ): Promise<T> {
    const start = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        unit: "ms",
        timestamp: new Date(),
        threshold: thresholds,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      this.recordMetric({
        name: `${name}_error`,
        value: duration,
        unit: "ms",
        timestamp: new Date(),
      });
      
      logger.error("Function execution failed", {
        function: name,
        duration,
        error: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Monitor database query performance
   */
  static async monitorQuery<T>(
    queryName: string,
    query: () => Promise<T>
  ): Promise<T> {
    return this.timeFunction(
      `db_query_${queryName}`,
      query,
      { warning: 1000, critical: 3000 } // 1s warning, 3s critical
    );
  }

  /**
   * Monitor API endpoint performance
   */
  static async monitorEndpoint<T>(
    endpoint: string,
    handler: () => Promise<T>
  ): Promise<T> {
    return this.timeFunction(
      `endpoint_${endpoint.replace(/\//g, "_")}`,
      handler,
      { warning: 500, critical: 2000 } // 500ms warning, 2s critical
    );
  }

  /**
   * Get performance summary
   */
  static getPerformanceSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const [name, measurements] of this.metrics.entries()) {
      if (measurements.length === 0) continue;
      
      const values = measurements.map(m => m.value);
      const recent = measurements.slice(-10); // Last 10 measurements
      
      summary[name] = {
        unit: measurements[0].unit,
        count: measurements.length,
        avg: values.reduce((sum, v) => sum + v, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        recent: recent.map(m => ({ value: m.value, timestamp: m.timestamp })),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99),
      };
    }
    
    return summary;
  }

  /**
   * Health check for critical services
   */
  static async runHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    
    // Database health
    checks.push(await this.checkDatabase());
    
    // Redis health
    checks.push(await this.checkRedis());
    
    // WhatsApp API health
    checks.push(await this.checkWhatsAppAPI());
    
    // Intelligence layer health
    checks.push(await this.checkIntelligenceAPI());
    
    return checks;
  }

  /**
   * Get system alerts
   */
  static async getActiveAlerts(): Promise<Array<{
    severity: "warning" | "critical";
    message: string;
    timestamp: Date;
    metric?: string;
  }>> {
    const alerts = [];
    
    // Check performance metrics for alerts
    for (const [name, measurements] of this.metrics.entries()) {
      const recent = measurements.slice(-5);
      if (recent.length === 0) continue;
      
      const avgRecent = recent.reduce((sum, m) => sum + m.value, 0) / recent.length;
      const threshold = recent[0].threshold;
      
      if (threshold) {
        if (avgRecent > threshold.critical) {
          alerts.push({
            severity: "critical" as const,
            message: `${name} average is ${avgRecent.toFixed(2)}${recent[0].unit} (threshold: ${threshold.critical}${recent[0].unit})`,
            timestamp: recent[recent.length - 1].timestamp,
            metric: name,
          });
        } else if (avgRecent > threshold.warning) {
          alerts.push({
            severity: "warning" as const,
            message: `${name} average is ${avgRecent.toFixed(2)}${recent[0].unit} (threshold: ${threshold.warning}${recent[0].unit})`,
            timestamp: recent[recent.length - 1].timestamp,
            metric: name,
          });
        }
      }
    }
    
    return alerts;
  }

  /**
   * Track business metrics in real-time
   */
  static async trackBusinessMetrics(shopId: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    
    try {
      // Get today's metrics
      const [cartsToday, recoveredToday, messagesToday] = await Promise.all([
        prisma.cart.count({
          where: {
            shopId,
            abandonedAt: {
              gte: new Date(today + "T00:00:00.000Z"),
            },
          },
        }),
        prisma.cart.count({
          where: {
            shopId,
            status: "RECOVERED",
            recoveredAt: {
              gte: new Date(today + "T00:00:00.000Z"),
            },
          },
        }),
        prisma.whatsAppMessage.count({
          where: {
            shopId,
            sentAt: {
              gte: new Date(today + "T00:00:00.000Z"),
            },
          },
        }),
      ]);

      // Update real-time cache
      await RealtimeCache.updateMetric(shopId, "carts_abandoned_today", cartsToday);
      await RealtimeCache.updateMetric(shopId, "carts_recovered_today", recoveredToday);
      await RealtimeCache.updateMetric(shopId, "messages_sent_today", messagesToday);
      
      if (cartsToday > 0) {
        await RealtimeCache.updateMetric(shopId, "recovery_rate_today", (recoveredToday / cartsToday) * 100);
      }
      
    } catch (error) {
      logger.error("Failed to track business metrics", { error, shopId });
    }
  }

  /**
   * Performance report for internal monitoring
   */
  static async generatePerformanceReport(): Promise<{
    summary: any;
    healthChecks: HealthCheck[];
    alerts: any[];
    systemMetrics: {
      uptime: number;
      memoryUsage: NodeJS.MemoryUsage;
      activeConnections: number;
    };
  }> {
    const [healthChecks, alerts] = await Promise.all([
      this.runHealthChecks(),
      this.getActiveAlerts(),
    ]);

    return {
      summary: this.getPerformanceSummary(),
      healthChecks,
      alerts,
      systemMetrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        activeConnections: this.getActiveConnectionCount(),
      },
    };
  }

  // Private methods

  private static checkThresholds(metric: PerformanceMetric): void {
    if (!metric.threshold) return;
    
    if (metric.value > metric.threshold.critical) {
      this.triggerAlert("critical", metric);
    } else if (metric.value > metric.threshold.warning) {
      this.triggerAlert("warning", metric);
    }
  }

  private static triggerAlert(severity: "warning" | "critical", metric: PerformanceMetric): void {
    // In production, this would send alerts to Slack, email, etc.
    logger.warn("Performance alert triggered", {
      severity,
      metric: metric.name,
      value: metric.value,
      unit: metric.unit,
      threshold: metric.threshold,
    });
  }

  private static percentile(values: number[], p: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private static async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      
      return {
        service: "database",
        status: "healthy",
        responseTime: Date.now() - start,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: "database",
        status: "critical",
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  private static async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // This would check Redis connectivity
      return {
        service: "redis",
        status: "healthy",
        responseTime: Date.now() - start,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: "redis",
        status: "critical",
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  private static async checkWhatsAppAPI(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // This would make a test call to WhatsApp API
      return {
        service: "whatsapp_api",
        status: "healthy",
        responseTime: Date.now() - start,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: "whatsapp_api",
        status: "warning",
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  private static async checkIntelligenceAPI(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // This would check intelligence API connectivity
      return {
        service: "intelligence_api",
        status: "healthy",
        responseTime: Date.now() - start,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: "intelligence_api",
        status: "warning",
        responseTime: Date.now() - start,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  private static getActiveConnectionCount(): number {
    // This would return actual connection count
    // For now, return a placeholder
    return 0;
  }
}

/**
 * Decorator for automatic performance monitoring
 */
export function monitored(name: string, thresholds?: { warning: number; critical: number }) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return MonitoringService.timeFunction(
        `${target.constructor.name}.${propertyName}`,
        () => method.apply(this, args),
        thresholds
      );
    };

    return descriptor;
  };
}

/**
 * Express middleware for automatic endpoint monitoring
 */
export function monitoringMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  const endpoint = `${req.method}_${req.route?.path || req.url}`;

  res.on("finish", () => {
    const duration = Date.now() - start;
    
    MonitoringService.recordMetric({
      name: `endpoint_${endpoint.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      value: duration,
      unit: "ms",
      timestamp: new Date(),
      threshold: { warning: 500, critical: 2000 },
    });
  });

  next();
}