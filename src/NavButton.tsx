import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

type Props = Omit<ComponentPropsWithoutRef<"button">, "title"> & {
  tooltip?: string;
};

export function NavButton({
  tooltip,
  children,
  onClick,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const label = tooltip ?? props["aria-label"];
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, arrow: 0 });

  const cancelTimer = useCallback(() => window.clearTimeout(timer.current), []);
  const dismiss = useCallback(() => {
    cancelTimer();
    setOpen(false);
  }, [cancelTimer]);
  const leave = () => {
    cancelTimer();
    if (!button.current?.matches(":focus-visible")) {
      // Allow crossing the small gap to hover the tooltip itself.
      timer.current = window.setTimeout(dismiss, 120);
    }
  };

  useEffect(() => cancelTimer, [cancelTimer]);
  useLayoutEffect(() => {
    if (!open || !button.current || !tip.current) return;
    const anchor = button.current.getBoundingClientRect();
    const width = tip.current.getBoundingClientRect().width;
    const center = anchor.left + anchor.width / 2;
    const left = Math.max(
      10,
      Math.min(center - width / 2, window.innerWidth - width - 10),
    );
    setPosition({ left, top: anchor.bottom + 12, arrow: center - left });
  }, [open, label]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open, dismiss]);

  return (
    <>
      <button
        {...props}
        ref={button}
        aria-describedby={
          [props["aria-describedby"], open ? id : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") {
            cancelTimer();
            timer.current = window.setTimeout(() => setOpen(true), 180);
          }
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          leave();
          onPointerLeave?.(event);
        }}
        onPointerDown={(event) => {
          dismiss();
          onPointerDown?.(event);
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            cancelTimer();
            setOpen(true);
          }
          onFocus?.(event);
        }}
        onBlur={(event) => {
          dismiss();
          onBlur?.(event);
        }}
        onClick={(event) => {
          dismiss();
          onClick?.(event);
        }}
      >
        {children}
      </button>
      {open &&
        label &&
        createPortal(
          <span
            ref={tip}
            id={id}
            role="tooltip"
            className="nav-tooltip"
            style={
              {
                left: position.left,
                top: position.top,
                "--tip-arrow": `${position.arrow}px`,
              } as CSSProperties
            }
            onPointerEnter={cancelTimer}
            onPointerLeave={leave}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
