import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import SessionGuard from "@/components/SessionGuard";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "知映 ZhiYing — 个人视频知识导航系统",
  description: "基于 B 站收藏视频自动构建知识树、规划学习路径、追溯视频片段证据的个人知识导航系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {/* 全局错误抑制 - 防止第三方库 crash 影响页面 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var _r = Node.prototype.removeChild;
            Node.prototype.removeChild = function(c){ if(!c||!c.parentNode)return c; try{return _r.call(this,c);}catch(e){return c;} };
            var _ri = Element.prototype.remove;
            Element.prototype.remove = function(){ try{ if(this.parentNode)_ri.call(this); }catch(e){} };
          })();
          window.addEventListener('error',function(e){ if(e.message&&e.message.includes('removeChild')){ e.preventDefault(); return false; } });
        `}} />
        <ThemeProvider>
          <AppShell>
            <SessionGuard>
              {children}
            </SessionGuard>
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
