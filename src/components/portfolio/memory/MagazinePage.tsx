import type { ReactNode } from "react";
import styles from "./magazine-page.module.css";

export type MagazinePageProps = {
  kicker: string;
  title: string;
  lead: string;
  children: ReactNode;
  art?: ReactNode;
};

/** Content sheet for a server-rendered overlay; the host owns dialog behavior. */
export function MagazinePage({ kicker, title, lead, children, art }: MagazinePageProps) {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>{kicker}</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.lead}>{lead}</p>
      </header>
      {art != null && <div className={styles.art}>{art}</div>}
      <div className={styles.body}>{children}</div>
    </article>
  );
}
