let _isShuttingDown = false;

export function isShuttingDown(): boolean {
  return _isShuttingDown;
}

export function setShuttingDown(): void {
  _isShuttingDown = true;
}
