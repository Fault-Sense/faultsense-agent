  // Mock HTMLElement for jsdom environment
  if (typeof HTMLElement === 'undefined') {
    (global as any).HTMLElement = class {};
  }