import Image from "next/image";
import SidebarTrigger from "@/components/SidebarTrigger";
import HomeVisitorCounter from "./HomeVisitorCounter";
import styles from "./home.module.css";

function Mailbox() {
  return (
    <span className={styles.mailbox} aria-hidden="true">
      <Image src="/res/home/v1/post_no.png" alt="" width={72} height={88} unoptimized />
      <span className={styles.mailboxLabel}>工事中</span>
    </span>
  );
}

export default function Home() {
  return (
    <main className={styles.home} lang="ja">
      <p className={styles.visitors}>
        あなたは <span className={styles.counter}><HomeVisitorCounter /></span> 人目の訪問者です。
      </p>
      <h1 className={styles.welcome}>
        <Image
          src="/res/home/v1/hhwtitle.png"
          alt="ＨＨＷ団のサイトにようこそ！"
          width={450}
          height={60}
          className={styles.titleImage}
          loading="eager"
          unoptimized
        />
      </h1>
      <div className={styles.emblem}>
        <Image
          src="/res/home/v1/logo.png"
          alt="HHW団のエンブレム"
          width={252}
          height={252}
          className={styles.logo}
          loading="eager"
          unoptimized
        />
      </div>
      <p className={styles.entrance}>
        <SidebarTrigger className={`${styles.entranceTrigger} lg:hidden`} label="入り口">入り口</SidebarTrigger>
        <span className="hidden lg:inline">入り口</span>
      </p>
      <p className={styles.contact}>
        <span>メールはこちらから→</span>
        <SidebarTrigger className={`${styles.mailboxTrigger} lg:hidden`} label="工事中"><Mailbox /></SidebarTrigger>
        <a href="#" className={`${styles.mailboxLink} hidden lg:block`} aria-label="工事中"><Mailbox /></a>
      </p>
    </main>
  );
}
