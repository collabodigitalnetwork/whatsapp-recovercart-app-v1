import prisma from "../db.server";

interface LogEventOptions {
  shopId: string;
  eventType: string;
  payload: unknown;
  customerHash?: string;
  ingestionSource: string;
}

export async function logEvent({ shopId, eventType, payload, customerHash, ingestionSource }: LogEventOptions) {
  return prisma.eventLog.create({
    data: {
      shopId,
      eventType,
      payload: payload as object,
      customerHash,
      ingestionSource,
    },
  });
}
