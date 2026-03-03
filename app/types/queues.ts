export interface RecoveryJobData {
  shopId: string;
  cartId: string;
  workflowId: string;
  stepId: string;
}

export interface DeliveryJobData {
  shopId: string;
  orderId: string;
  deliveryId: string;
}

export interface InsightJobData {
  shopId: string;
  eventId: string;
  eventType: string;
}
