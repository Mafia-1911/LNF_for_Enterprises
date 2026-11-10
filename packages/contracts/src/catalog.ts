import { CATEGORY_CODES, COLOUR_CODES } from '@lf/domain';
import { z } from 'zod';

export const CategorySchema = z
  .object({
    code: z.enum(CATEGORY_CODES),
    label: z.string(),
    sensitive: z.boolean(),
    restricted: z.boolean(),
  })
  .meta({ id: 'Category' });

export const ColourSchema = z
  .object({ code: z.enum(COLOUR_CODES), label: z.string(), swatch: z.string() })
  .meta({ id: 'Colour' });

export const ZoneSchema = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'Zone' });
export const FloorSchema = z
  .object({ id: z.uuid(), name: z.string(), zones: z.array(ZoneSchema) })
  .meta({ id: 'Floor' });
export const BuildingSchema = z
  .object({ code: z.string(), name: z.string(), floors: z.array(FloorSchema) })
  .meta({ id: 'Building' });

export const CatalogSchema = z
  .object({
    /** Categories this person may pick (restricted ones only for desk staff). */
    categories: z.array(CategorySchema),
    colours: z.array(ColourSchema),
    buildings: z.array(BuildingSchema),
    /** The Lost & Found desk's building: the default "where found" at intake (WF-03). */
    deskBuildingCode: z.string().nullable(),
  })
  .meta({ id: 'Catalog' });
export type Catalog = z.infer<typeof CatalogSchema>;
