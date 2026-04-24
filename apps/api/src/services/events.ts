import { connect, StringCodec, type NatsConnection } from "nats";
import { logger } from "../logger";

// Thin NATS JetStream publisher wrapper. Consumer code lives in apps/analyzer.

let connection: NatsConnection | undefined;
const codec = StringCodec();

export async function getNats(url: string): Promise<NatsConnection> {
  if (connection && !connection.isClosed()) return connection;
  connection = await connect({ servers: url, name: "sentinel-api", maxReconnectAttempts: -1 });
  logger.info({ url }, "connected to NATS");
  connection.closed().then((err: unknown) => {
    if (err) logger.error({ err }, "NATS connection closed with error");
  });
  return connection;
}

export async function publishEvent(
  url: string,
  subject: string,
  payload: unknown,
): Promise<void> {
  // Skip entirely if NATS isn't configured for this deploy. Events are
  // best-effort by design — REST still serves, WS fan-out silently degrades.
  if (!url || url.trim() === "") return;
  try {
    const nc = await getNats(url);
    nc.publish(subject, codec.encode(JSON.stringify(payload)));
  } catch (err) {
    logger.warn({ err, subject }, "failed to publish event");
  }
}
