export const DRAFT_CHANNEL_ORDER = ['naver', 'tistory', 'tistoryEn', 'shortform'] as const;
type DraftChannel = (typeof DRAFT_CHANNEL_ORDER)[number];
type ChannelBodies = Partial<Record<DraftChannel, string>>;

export function isUnreadableDraftText(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const body = value.split(/(?:^|\n)#{1,3}\s*(?:관련\s*태그|Related Tags|Tags)\s*(?:\n|$)/i)[0];
  const words = body.match(/[\p{L}\p{N}]+/gu) || [];
  const hex = words.filter(word => /^[a-f0-9]{2}$/i.test(word)).length;
  return (!/\p{Script=Hangul}/u.test(body) && hex >= 5 && hex >= words.length * 0.66) ||
    (body.match(/\uFFFD/g) || []).length >= Math.max(3, (body.match(/\p{L}/gu) || []).length * 0.1) ||
    (words.length >= 12 && new Set(words.map(word => word.toLowerCase())).size <= 2);
}

export function firstWrittenChannel(draft: ChannelBodies | undefined): DraftChannel | undefined {
  return DRAFT_CHANNEL_ORDER.find(channel => !!draft?.[channel]?.trim() && !isUnreadableDraftText(draft[channel]));
}

export function resolveDraftBody(channel: DraftChannel, saved: ChannelBodies | undefined, generated: ChannelBodies | undefined): string {
  const edited = saved?.[channel];
  // An intentionally blank edit is valid when no original is available, but it
  // cannot hide a nonempty response when reopening or rehydrating the editor.
  const output = generated?.[channel];
  return edited?.trim() && !isUnreadableDraftText(edited) ? edited :
    isUnreadableDraftText(output) ? '' : (output || '');
}

export const ARTICLE_CHANNELS = [
  { id: 'naver', label: '네이버 한글' },
  { id: 'tistory', label: '티스토리 한글' },
  { id: 'tistoryEn', label: '티스토리 영문' },
] as const;
type ArticleChannel = (typeof ARTICLE_CHANNELS)[number]['id'];
type DraftSlot = { id: string; generationChannel?: ArticleChannel } & ChannelBodies;

export function retainDraftTopics<T extends DraftSlot>(entries: T[], limit = 40): T[] {
  const ids = new Set([...new Set(entries.map(entry => entry.id))].slice(0, limit));
  return entries.filter(entry => ids.has(entry.id));
}

export function saveChannelDraft<T extends DraftSlot>(entries: T[], draft: T): T[] {
  return retainDraftTopics([draft, ...entries.filter(entry =>
    entry.id !== draft.id || entry.generationChannel !== draft.generationChannel)]);
}

export function findChannelDraft<T extends DraftSlot>(entries: T[], id: string, channel: DraftChannel): T | undefined {
  // A per-channel result wins even when it's an unsuccessful attempt; legacy
  // bundled responses are still available on channels not generated since then.
  return entries.find(entry => entry.id === id && entry.generationChannel === channel) ??
    entries.find(entry => entry.id === id && !entry.generationChannel);
}

export function mergeGeneratedFields<Review>(
  current: { fields?: ChannelBodies; titles?: Partial<Record<ArticleChannel, string>>; evidenceReview?: Partial<Record<DraftChannel, Review>> } | undefined,
  channel: ArticleChannel, body: string, title: string,
) {
  const evidenceReview = { ...current?.evidenceReview };
  delete evidenceReview[channel];
  return { fields: { ...current?.fields, [channel]: body },
    titles: { ...current?.titles, [channel]: title }, evidenceReview };
}
