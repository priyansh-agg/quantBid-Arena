/** Minimum bid increment rule (matches backend) */
export function getMinIncrement(currentBid: number): number {
  if (currentBid <= 100) return 10;
  if (currentBid <= 200) return 20;
  return 50;
}
