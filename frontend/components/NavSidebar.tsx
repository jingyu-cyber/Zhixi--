"use client";

import { usePathname } from "next/navigation";

export default function NavSidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "首页", icon: "home", primary: true },
    { href: "/workspace", label: "工作台", icon: "workspace", primary: true },
    { href: "/tree", label: "知识树", icon: "tree", primary: true },
    { href: "/search", label: "搜索", icon: "search", primary: true },
    { href: "/chat", label: "知识问答", icon: "chat", primary: true },
    { href: "/learning-path", label: "学习路径", icon: "learning", primary: false },
    { href: "/organizer", label: "整理中心", icon: "organizer", primary: false },
    { href: "/game", label: "知识对战", icon: "game", primary: false },
    { href: "/review", label: "复习", icon: "review", primary: false },
  ];

  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
    workspace: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    tree: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="5" r="2" />
        <circle cx="7" cy="14" r="1.5" />
        <circle cx="17" cy="14" r="1.5" />
        <path d="M12 7v3M9.5 12.5l-1.5 1M14.5 12.5l1.5 1" />
        <circle cx="5" cy="20" r="1.2" />
        <circle cx="9.5" cy="20" r="1.2" />
        <circle cx="17" cy="20" r="1.2" />
        <path d="M6.2 15.5l-0.5 3.3M8.2 15.5l0.5 3.3M17 15.5v3.3" />
      </svg>
    ),
    search: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    chat: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
    learning: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3L2 9l10 6 10-6-10-6z" />
        <path d="M2 17l10 6 10-6" />
        <path d="M2 13l10 6 10-6" />
      </svg>
    ),
    organizer: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h7" />
        <circle cx="18" cy="12" r="3" />
        <circle cx="14" cy="18" r="2" />
      </svg>
    ),
    game: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 11V9a6 6 0 0112 0v2" />
        <rect x="6" y="11" width="12" height="8" rx="2" />
        <circle cx="9" cy="15" r="1.2" />
        <circle cx="15" cy="15" r="1.2" />
        <path d="M12 14v3" />
      </svg>
    ),
    review: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <path d="M9 15h6M9 18h3" />
      </svg>
    ),
  };

  return (
    <nav className="nav-sidebar" aria-label="主导航">
      <div className="nav-primary-group">
        {links.filter(l => l.primary).map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`nav-item ${pathname === link.href ? "active" : ""}`}
            aria-label={link.label}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            <span aria-hidden="true">{icons[link.icon]}</span>
            <span>{link.label}</span>
          </a>
        ))}
      </div>
      <div className="nav-divider" />
      <div className="nav-secondary-group">
        {links.filter(l => !l.primary).map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`nav-item nav-item-secondary ${pathname === link.href ? "active" : ""}`}
            aria-label={link.label}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            <span aria-hidden="true">{icons[link.icon]}</span>
            <span>{link.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
