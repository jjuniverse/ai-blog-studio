export const DRAFT_CHANNEL_ORDER = ['naver', 'tistory', 'tistoryEn', 'shortform'] as const;
type DraftChannel = (typeof DRAFT_CHANNEL_ORDER)[number];
type ChannelBodies = Partial<Record<DraftChannel, string>>;

export function firstWrittenChannel(draft: ChannelBodies | undefined): DraftChannel | undefined {
  return DRAFT_CHANNEL_ORDER.find(channel => !!draft?.[channel]?.trim());
}

export function resolveDraftBody(channel: DraftChannel, saved: ChannelBodies | undefined, generated: ChannelBodies | undefined): string {
  const edited = saved?.[channel];
  // An intentionally blank edit is valid when no original is available, but it
  // cannot hide a nonempty response when reopening or rehydrating the editor.
  return edited?.trim() ? edited : (generated?.[channel] || '');
}
