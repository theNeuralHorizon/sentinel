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
  try {
    const nc = await getNats(url);
    nc.publish(subject, codec.encode(JSON.stringify(payload)));
  } catch (err) {
    // Events are best-effort — never fail the HTTP path on publish errors.
    logger.warn({ err, subject }, "failed to publish event");
  }
}
