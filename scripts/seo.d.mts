export type SeoContent = Record<string, unknown>
export type ContactInfo = { email: string; phone: string; links: Array<{ label: string; url: string }> }
export type SeoSection = { label: string; stage: { id: string; heading: string; subheading?: string; cards: Array<Record<string, unknown>> } }

export const SITE_URL: string
export const SISTER_SITE_URL: string
export const OG_IMAGE_URL: string
export const PHOTO_URL: string
export const JOB_TITLE: string
export const SITE_DESCRIPTION: string
export const HEAD_MARKERS: [string, string]
export const BODY_MARKERS: [string, string]

export function loadContent(): Promise<SeoContent>
export function escapeHtml(value: unknown): string
export function parseCitation(citation: string, title: string): { authors: string[]; title: string; venue: string }
export function getSections(content: SeoContent): SeoSection[]
export function cardIds(stage: { id: string; cards: Array<{ title: string }> }): string[]
export function getContact(content: SeoContent): ContactInfo
export function buildJsonLd(content: SeoContent): { "@context": string; "@graph": Array<Record<string, any>> }
export function buildHead(content: SeoContent): string
export function buildBody(content: SeoContent): string
export function buildLlmsTxt(content: SeoContent): string
export function buildSitemap(): string
export function extractBetween(html: string, markers: readonly [string, string]): string
export function replaceBetween(html: string, markers: readonly [string, string], replacement: string, indent: string): string
