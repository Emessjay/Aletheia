/** True for `/`, `//`, or any all-slash pathname (browser-normalized site root). */
export function isRootPath(pathname: string): boolean {
  if (pathname === "" || pathname === "/") return true;
  return /^\/+$/.test(pathname);
}
