export interface EmptyStateProps {
  heading: string;
  children: React.ReactNode;
  action?: {
    content: string;
    onAction: () => void;
  };
  image?: string;
}

export function EmptyState({ heading, children, action, image }: EmptyStateProps) {
  return (
    <s-empty-state 
      heading={heading} 
      image={image || "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"}
    >
      <s-paragraph>{children}</s-paragraph>
      {action && (
        <s-button onClick={action.onAction}>{action.content}</s-button>
      )}
    </s-empty-state>
  );
}