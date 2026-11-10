// Photo pipeline (plan §6.1, FR-05, ADR-0007): only clean WebP reaches storage, metadata is gone,
// and who may see a photo follows the record it belongs to.
import type { FoundPost, LoggedFoundItem, UploadedPhoto } from '@lf/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

async function jpegWithExif(width = 2400, height = 1800): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .jpeg({ quality: 90 })
    .withExif({ IFD0: { Copyright: 'SECRET-EXIF-OWNER', Artist: 'Someone' } })
    .toBuffer();
  return new Uint8Array(buf);
}

function form(bytes: Uint8Array, name = 'photo.jpg', type = 'image/jpeg'): FormData {
  const f = new FormData();
  f.append('file', new File([Buffer.from(bytes)], name, { type }));
  return f;
}

async function upload(who: string): Promise<UploadedPhoto> {
  const c = await ctx.as(who);
  const res = await c.request<{ photo: UploadedPhoto }>(
    'POST',
    '/api/photos',
    form(await jpegWithExif()),
  );
  expect(res.status).toBe(201);
  return res.body.photo;
}

const hourAgo = new Date(new Date(TEST_NOW).getTime() - 3_600_000).toISOString();

describe('POST /api/photos', () => {
  it('re-encodes to WebP within 1600 px and 500 KB and drops the metadata', async () => {
    const student = await ctx.as(email.student);
    const res = await student.request<{ photo: UploadedPhoto }>(
      'POST',
      '/api/photos',
      form(await jpegWithExif()),
    );
    expect(res.status).toBe(201);
    const photo = res.body.photo;
    expect(photo.width).toBe(1600);
    expect(photo.height).toBe(1200);
    expect(photo.bytes).toBeLessThanOrEqual(500 * 1024);

    const view = await student.get(`/api/photos/${photo.id}`);
    expect(view.status).toBe(200);
    expect(view.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(view.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(view.text).not.toContain('SECRET-EXIF-OWNER');
    const row = await ctx.owner.query<{ status: string; visibility: string }>(
      'select status, visibility from photos where tenant_id = $1 and id = $2',
      [ctx.tenantA, photo.id],
    );
    expect(row.rows[0]).toEqual({ status: 'unattached', visibility: 'private' });
  });

  it('refuses files that are not JPEG, PNG or WebP, whatever their name says', async () => {
    const student = await ctx.as(email.student);
    const fake = new TextEncoder().encode('%PDF-1.7 not an image');
    const res = await student.request<{ error: { message: string } }>(
      'POST',
      '/api/photos',
      form(fake, 'photo.jpg', 'image/jpeg'),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "That file isn't a photo we can read; choose a JPEG, PNG or WebP image.",
    );
  });

  it('needs a signed-in person', async () => {
    const res = await ctx
      .anonymous()
      .request('POST', '/api/photos', form(await jpegWithExif(100, 100)));
    expect(res.status).toBe(401);
  });
});

describe('who can see a photo', () => {
  it('keeps a finder post photo private until the desk receives the item, then shows it', async () => {
    const photo = await upload(email.student2);
    const finder = await ctx.as(email.student2);
    const post = await finder.post<FoundPost>('/api/found-items', {
      category: 'bottle',
      colour: 'blue',
      shortName: 'Blue bottle',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'GYM', floorId: null, zoneId: null },
      foundAt: hourAgo,
      privateTicks: [],
      privateNote: null,
      photoIds: [photo.id],
      pingReportIds: [],
    });
    expect(post.status).toBe(201);
    expect(post.body.photoIds).toEqual([photo.id]);

    const other = await ctx.as(email.student);
    expect((await other.get(`/api/photos/${photo.id}`)).status).toBe(404);
    expect((await finder.get(`/api/photos/${photo.id}`)).status).toBe(200);
    const desk = await ctx.as(email.desk);
    expect((await desk.get(`/api/photos/${photo.id}`)).status).toBe(200);

    await desk.post(`/api/desk/found-items/${post.body.id}/receive`, {
      category: 'bottle',
      colour: 'blue',
      shortName: 'Blue bottle',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'GYM', floorId: null, zoneId: null },
      foundAt: hourAgo,
      privateTicks: [],
      privateNote: null,
      photoIds: [],
      condition: null,
      conditionPhotoIds: [],
      binCode: 'A-01',
      idNumber: null,
    });
    expect((await other.get(`/api/photos/${photo.id}`)).status).toBe(200);
    // Visitors can't browse the gallery, so they can't see gallery photos either.
    expect((await (await ctx.as(email.visitor)).get(`/api/photos/${photo.id}`)).status).toBe(404);
  });

  it('keeps sensitive-item and condition photos for desk staff only', async () => {
    const itemPhoto = await upload(email.desk);
    const damage = await upload(email.desk);
    const desk = await ctx.as(email.desk);
    const logged = await desk.post<LoggedFoundItem>('/api/desk/found-items', {
      category: 'wallet',
      colour: 'brown',
      shortName: 'Brown wallet',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
      foundAt: hourAgo,
      privateTicks: [],
      privateNote: null,
      photoIds: [itemPhoto.id],
      condition: 'Torn corner',
      conditionPhotoIds: [damage.id],
      binCode: 'S-01',
      idNumber: null,
    });
    expect(logged.status).toBe(201);
    expect(logged.body.item.conditionPhotoIds).toEqual([damage.id]);
    const student = await ctx.as(email.student);
    expect((await student.get(`/api/photos/${itemPhoto.id}`)).status).toBe(200);
    expect((await student.get(`/api/photos/${damage.id}`)).status).toBe(404);
  });

  it("won't attach someone else's photo or the same photo twice", async () => {
    const photo = await upload(email.student);
    const thief = await ctx.as(email.student2);
    const body = {
      category: 'bottle',
      colour: null,
      shortName: null,
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'GYM', floorId: null, zoneId: null },
      foundAt: hourAgo,
      privateTicks: [],
      privateNote: null,
      photoIds: [photo.id],
      pingReportIds: [],
    };
    const res = await thief.post<{ error: { fields: Record<string, string> } }>(
      '/api/found-items',
      body,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fields['photoIds']).toMatch(/isn't available any more/);
    const owner = await ctx.as(email.student);
    expect((await owner.post('/api/found-items', body)).status).toBe(201);
    expect((await owner.post('/api/found-items', body)).status).toBe(400);
  });

  it('answers 404 for an unknown photo and 400 for a malformed id', async () => {
    const student = await ctx.as(email.student);
    expect((await student.get('/api/photos/2f1e7c56-8f5b-4c8e-9d6a-2a6b9a7d1e00')).status).toBe(
      404,
    );
    expect((await student.get('/api/photos/not-a-uuid')).status).toBe(400);
  });
});
