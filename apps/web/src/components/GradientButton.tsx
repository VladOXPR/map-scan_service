import type { MouseEventHandler, ReactNode } from "react";

interface GradientButtonBaseProps {
  label: string;
  icon?: ReactNode;
  size?: "md" | "sm";
  className?: string;
}

type GradientButtonProps = GradientButtonBaseProps &
  (
    | { href?: undefined; onClick: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }
    | { href: string; onClick?: MouseEventHandler<HTMLAnchorElement>; disabled?: undefined }
  );

/** Blue gradient CTA from the user app (Get Directions / Nearest location). */
export function GradientButton(props: GradientButtonProps) {
  const { label, icon, size = "md", className } = props;
  const classes = ["cuub-gradient-btn", size === "sm" ? "cuub-gradient-btn--sm" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span className="cuub-gradient-btn-label">{label}</span>
      {icon}
    </>
  );

  if (props.href !== undefined) {
    return (
      <a className={classes} href={props.href} rel="noopener noreferrer" onClick={props.onClick}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} disabled={props.disabled} onClick={props.onClick}>
      {content}
    </button>
  );
}
