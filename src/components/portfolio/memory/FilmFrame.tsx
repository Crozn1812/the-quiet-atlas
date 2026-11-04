import type { ReactNode } from "react";
import styles from "./film-frame.module.css";

export type FilmFrameProps = {
  children: ReactNode;
  date: string;
  caption?: string;
  variant?: "color" | "mono";
};

export function FilmFrame({ children, date, caption, variant = "color" }: FilmFrameProps) {
  return (
    <figure className={styles.frame} data-variant={variant}>
      <div className={styles.exposure}>
        <div className={styles.image}>{children}</div>
        <span className={styles.grain} aria-hidden="true" />
        <span className={styles.leak} aria-hidden="true" />
      </div>
      <div className={styles.imprint}>
        <span className={styles.date}>{date}</span>
      </div>
      {caption !== undefined && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
