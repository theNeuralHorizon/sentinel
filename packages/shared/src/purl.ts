// Tiny Package URL (purl) parser/formatter.
// Spec: https://github.com/package-url/purl-spec

export interface Purl {
  type: string;
  namespace?: string;
  name: string;
  version?: string;
  qualifiers?: Record<string, string>;
  subpath?: string;
}

export class PurlError extends Error {
  constructor(message: string) {
    super(`purl: ${message}`);
    this.name = "PurlError";
  }
}

export function parsePurl(raw: string): Purl {
  if (!raw.startsWith("pkg:")) {
    throw new PurlError(`missing "pkg:" prefix in ${raw}`);
  }
  const body = raw.slice(4);

  const [beforeQuery, subpath] = body.split("#", 2);
  const [beforeQualifiers, query] = beforeQuery!.split("?", 2);

  const slashIdx = beforeQualifiers!.indexOf("/");
  if (slashIdx < 0) {
    throw new PurlError(`no type separator in ${raw}`);
  }
  const type = beforeQualifiers!.slice(0, slashIdx).toLowerCase();
  let rest = beforeQualifiers!.slice(slashIdx + 1);

  // Split off version (@) — only the last @ not inside a namespace segment.
  let version: string | undefined;
  const atIdx = rest.lastIndexOf("@");
  if (atIdx > 0) {
    version = decodeURIComponent(rest.slice(atIdx + 1));
    rest = rest.slice(0, atIdx);
  }

  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new PurlError(`no name in ${raw}`);
  }
  const name = decodeURIComponent(parts.pop()!);
  const namespace = parts.length
    ? parts.map((p) => decodeURIComponent(p)).join("/")
    : undefined;

  const qualifiers: Record<string, string> = {};
  if (query) {
    for (const kv of query.split("&")) {
      const [k, v] = kv.split("=", 2);
      if (k) qualifiers[k] = v ? decodeURIComponent(v) : "";
    }
  }

  return {
    type,
    ...(namespace !== undefined ? { namespace } : {}),
    name,
    ...(version !== undefined ? { version } : {}),
    ...(Object.keys(qualifiers).length ? { qualifiers } : {}),
    ...(subpath !== undefined ? { subpath: decodeURIComponent(subpath) } : {}),
  };
}

export function formatPurl(p: Purl): string {
  let result = `pkg:${p.type}`;
  if (p.namespace) {
    result += "/" + p.namespace.split("/").map(encodeURIComponent).join("/");
  }
  result += "/" + encodeURIComponent(p.name);
  if (p.version) result += "@" + encodeURIComponent(p.version);
  if (p.qualifiers && Object.keys(p.qualifiers).length) {
    const q = Object.entries(p.qualifiers)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    result += "?" + q;
  }
  if (p.subpath) result += "#" + encodeURIComponent(p.subpath);
  return result;
}

export function purlFor(
  ecosystem: string,
  name: string,
  version: string,
  namespace?: string,
): string {
  const type = ecosystemToPurlType(ecosystem);
  const p: Purl = { type, name, version };
  if (namespace) p.namespace = namespace;
  return formatPurl(p);
}

export function ecosystemToPurlType(ecosystem: string): string {
  switch (ecosystem) {
    case "gomodules":
      return "golang";
    case "rubygems":
      return "gem";
    case "container":
      return "oci";
    case "ml_model":
      return "huggingface";
    case "dataset":
      return "hf-dataset";
    case "mcp_server":
      return "mcp";
    default:
      return ecosystem;
  }
}
