import { CMS, CMS_LOGO, type CmsKind } from "@/lib/cmsTypes";

/** A CMS's logo in a soft square, for the Sites page and the connect wizard. The webhook draws a link icon. */
export function CmsLogo({ kind, size = 32 }: { kind: CmsKind; size?: number }) {
  const src = CMS_LOGO[kind];
  const label = CMS.find((c) => c.id === kind)?.label ?? kind;
  return (
    <span className="aw-cms-logo" style={{ width: size, height: size }} title={label}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} width={Math.round(size * 0.78)} height={Math.round(size * 0.78)} />
      ) : (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label={label}>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
      )}
    </span>
  );
}
