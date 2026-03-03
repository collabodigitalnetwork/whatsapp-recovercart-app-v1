export interface StatCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    positive: boolean;
  };
  suffix?: string;
  loading?: boolean;
}

export function StatCard({ title, value, trend, suffix, loading }: StatCardProps) {
  return (
    <s-card>
      <s-box padding="base">
        <s-stack direction="block" gap="tight">
          <s-text variant="headingMd">{title}</s-text>
          {loading ? (
            <s-skeleton-body-text lines={1} />
          ) : (
            <s-stack direction="inline" gap="tight" align="baseline">
              <s-text variant="heading2xl">{value}</s-text>
              {suffix && <s-text variant="headingMd">{suffix}</s-text>}
              {trend && (
                <s-badge tone={trend.positive ? "success" : "critical"}>
                  {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
                </s-badge>
              )}
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-card>
  );
}