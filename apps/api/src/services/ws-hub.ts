import { logger } from "../logger";

// In-process WebSocket fan-out hub. Each connection subscribes to "topics"
// (usually `project:<id>` or `scan:<id>`). The NATS consumer in the API
// publishes events that match those topics. Single-process only; in HA mode
// we'd use Dragonfly Pub/Sub instead.

export interface WsHub {
  subscribe(ws: WebSocket, topics: string[]): void;
  unsubscribe(ws: WebSocket): void;
  publish(topic: string, message: unknown): void;
  size(): number;
}

export function createWsHub(): WsHub {
  // topic -> Set<WebSocket>
  const subs = new Map<string, Set<WebSocket>>();
  // WebSocket -> Set<topic>
  const reverse = new WeakMap<WebSocket, Set<string>>();
  let size = 0;

  return {
    subscribe(ws, topics) {
      let topicSet = reverse.get(ws);
      if (!topicSet) {
        topicSet = new Set();
        reverse.set(ws, topicSet);
        size += 1;
      }
      for (const t of topics) {
        topicSet.add(t);
        let bucket = subs.get(t);
        if (!bucket) {
          bucket = new Set();
          subs.set(t, bucket);
        }
        bucket.add(ws);
      }
    },
    unsubscribe(ws) {
      const topicSet = reverse.get(ws);
      if (!topicSet) return;
      for (const t of topicSet) {
        const bucket = subs.get(t);
        if (!bucket) continue;
        bucket.delete(ws);
        if (bucket.size === 0) subs.delete(t);
      }
      reverse.delete(ws);
      size -= 1;
    },
    publish(topic, message) {
      const bucket = subs.get(topic);
      if (!bucket || bucket.size === 0) return;
      const body = JSON.stringify({ topic, message });
      let sent = 0;
      for (const ws of bucket) {
        try {
          if (ws.readyState === ws.OPEN) {
            ws.send(body);
            sent += 1;
          }
        } catch (err) {
          logger.warn({ err, topic }, "ws send failed");
        }
      }
      logger.debug({ topic, sent }, "ws publish");
    },
    size() {
      return size;
    },
  };
}
