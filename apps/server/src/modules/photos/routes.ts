// POST /api/photos (multipart, field "file") and GET /api/photos/{id} (the clean WebP, permission-checked).
import { UploadedPhotoSchema } from '@lf/contracts';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { readPhoto, uploadPhoto, type PhotosDeps } from './service';

// zod-to-openapi has no z.file(); describe the part as a binary string and check it is a File.
const UploadSchema = z.object({
  file: z
    .custom<File>((v) => v instanceof File, 'Choose a photo to upload.')
    .openapi({ type: 'string', format: 'binary' }),
});

export function photosRoutes(guards: Guards, deps: PhotosDeps) {
  const router = createRouter();

  const upload = createRoute({
    method: 'post',
    path: '/api/photos',
    tags: ['photos'],
    summary: 'Upload a photo (re-encoded to WebP ≤ 500 KB, metadata removed)',
    middleware: [guards.requireUser()] as const,
    request: {
      body: {
        required: true,
        content: { 'multipart/form-data': { schema: UploadSchema } },
      },
    },
    responses: {
      201: {
        description: 'The clean photo, not yet attached to anything.',
        content: { 'application/json': { schema: z.object({ photo: UploadedPhotoSchema }) } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
      429: errorResponses[429],
    },
  });
  router.openapi(upload, async (c) => {
    const { file } = c.req.valid('form');
    const photo = await uploadPhoto(deps, c.var.ctx, new Uint8Array(await file.arrayBuffer()));
    return c.json({ photo }, 201);
  });

  const view = createRoute({
    method: 'get',
    path: '/api/photos/{id}',
    tags: ['photos'],
    summary: 'A photo, if you may see it',
    middleware: [guards.requireUser()] as const,
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: {
        description: 'The WebP image.',
        content: { 'image/webp': { schema: z.string().meta({ format: 'binary' }) } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  });
  router.openapi(view, async (c) => {
    const bytes = await readPhoto(deps, c.var.ctx, c.req.valid('param').id);
    return c.body(bytes.slice().buffer, 200, {
      'content-type': 'image/webp',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
  });

  return router;
}
