// A screen's tab from its address. Pure, so tests can cover it.

/** The tab an address names, or the first tab when it names none or one the screen doesn't have. */
export function tabOf<T extends string>(sub: string | undefined, tabs: readonly T[], first: T): T {
  return (tabs as readonly string[]).includes(sub ?? "") ? (sub as T) : first;
}
