import type { VercelRequest } from '@vercel/node';

const MAX_BODY_BYTES = 1024 * 1024;

export async function readJsonBody<T = any>(req: VercelRequest): Promise<T> {
  const bodyAny = (req as any).body;

  if (bodyAny && typeof bodyAny === 'object') {
    return bodyAny as T;
  }

  if (typeof bodyAny === 'string' && bodyAny.trim().length > 0) {
    return JSON.parse(bodyAny) as T;
  }

  const chunks: Buffer[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve());
    req.on('error', (err) => reject(err));
  });

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

