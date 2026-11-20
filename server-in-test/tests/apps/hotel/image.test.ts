// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_EDGE, prepareUpload } from '../../../src/apps/hotel/image';

afterEach(() => vi.unstubAllGlobals());

function stubCanvas(width: number, height: number) {
  const drawImage = vi.fn();
  const created: HTMLCanvasElement[] = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close: vi.fn() })));
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'canvas') {
      created.push(el as HTMLCanvasElement);
      Object.assign(el, {
        getContext: () => ({ drawImage }),
        toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob(['small'], { type })),
      });
    }
    return el;
  });
  return { drawImage, created };
}

describe('prepareUpload', () => {
  it('scales large photos down to 1600 px on the long edge as JPEG', async () => {
    const { created, drawImage } = stubCanvas(4000, 3000);
    const original = new File([new Uint8Array(3_000_000)], 'big.jpg', { type: 'image/jpeg' });
    const result = await prepareUpload(original);
    expect(MAX_EDGE).toBe(1600);
    expect(created[0]).toMatchObject({ width: 1600, height: 1200 });
    expect(drawImage).toHaveBeenCalled();
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeLessThan(original.size);
  });

  it('keeps small photos as they are', async () => {
    stubCanvas(800, 600);
    const original = new File([new Uint8Array(200_000)], 'small.png', { type: 'image/png' });
    expect(await prepareUpload(original)).toBe(original);
  });

  it('falls back to the original when the browser cannot decode or draw it', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const original = new File([new Uint8Array(3_000_000)], 'big.jpg', { type: 'image/jpeg' });
    expect(await prepareUpload(original)).toBe(original);
  });

  it('never re-encodes animated GIFs', async () => {
    stubCanvas(4000, 3000);
    const gif = new File([new Uint8Array(3_000_000)], 'cat.gif', { type: 'image/gif' });
    expect(await prepareUpload(gif)).toBe(gif);
  });
});
