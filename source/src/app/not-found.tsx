import Link from "next/link";

export default function NotFound() {
  return (
    <div className="exploration-app">
      <main className="exploration-empty-page">
        <span className="exploration-eyebrow">这条小路暂时没有入口</span>
        <h1>换个方向，也可以。</h1>
        <p>回去看看，还有别的小可能。</p>
        <Link href="/" className="exploration-primary">
          回到漫游
        </Link>
      </main>
    </div>
  );
}
