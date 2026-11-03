/** Verify Telegram confirmed every photo AND the caption, without retrying. */
export class AlbumConfirmationError extends Error {
  constructor(code: 'TELEGRAM_ALBUM_CONFIRMATION_INCOMPLETE' | 'TELEGRAM_CAPTION_NOT_CONFIRMED') {
    super(code);
    this.name = 'AlbumConfirmationError';
  }
}

export function verifyAlbumResponse(response: unknown, expectedPhotos: number, expectedCaption: string): number[] {
  const messages = Array.isArray(response) ? response : [response];
  if (messages.length !== expectedPhotos || expectedPhotos < 1 || expectedPhotos > 10)
    throw new AlbumConfirmationError('TELEGRAM_ALBUM_CONFIRMATION_INCOMPLETE');
  const ids = messages.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return NaN;
    return Number((entry as { id?: unknown }).id);
  });
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length)
    throw new AlbumConfirmationError('TELEGRAM_ALBUM_CONFIRMATION_INCOMPLETE');
  // Telegram photo albums display a caption when exactly one image has it.
  // A missing or altered caption is uncertain: NEVER automatically repost.
  if (expectedCaption) {
    const texts = messages.map((entry: unknown) =>
      entry && typeof entry === 'object' && typeof (entry as { message?: unknown }).message === 'string'
        ? (entry as { message: string }).message : null);
    if (texts.filter(text => text !== null && text.length > 0).length !== 1 ||
        !texts.some(text => text === expectedCaption)) {
      throw new AlbumConfirmationError('TELEGRAM_CAPTION_NOT_CONFIRMED');
    }
  }
  return ids;
}
