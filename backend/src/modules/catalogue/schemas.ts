import { z } from 'zod'

export const listQuerySchema = z.object({
  query: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  displayOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
})

export const productCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  unit: z.string().trim().min(1).max(30),
  pricePaise: z.number().int().positive().max(10_000_000),
  imageUrl: z.string().trim().min(1).max(500),
  description: z.string().trim().max(300).optional(),
  isAvailable: z.boolean().default(true),
})

export const productUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  pricePaise: z.number().int().positive().max(10_000_000).optional(),
  imageUrl: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  isAvailable: z.boolean().optional(),
})

export const importSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
})
