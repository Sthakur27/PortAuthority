export function parseSs(output) {
  const found = [];
  for (const line of output.split('\n')) {
    const endpoint = line.trim().split(/\s+/)[3];
    const port = Number(endpoint?.match(/:(\d+)$/)?.[1]);
    if (!port) continue;
    for (const match of line.matchAll(/\("([^"]+)",pid=(\d+),fd=\d+\)/g)) {
      found.push({ pid: Number(match[2]), command: match[1], port, endpoint });
    }
  }
  return [...new Map(found.map(item => [`${item.pid}:${item.port}`, item])).values()];
}
